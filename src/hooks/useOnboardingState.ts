import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";

export interface OnboardingState {
  tenant_id: string;
  step_completed: number;
  payload: Record<string, unknown>;
  completed_at: string | null;
  updated_at: string;
}

export const ONBOARDING_TOTAL_STEPS = 6;

/**
 * Read the current tenant's wizard state. Returns null until the row is
 * created; the wizard's first save inserts it.
 */
export function useOnboardingState() {
  const { data: currentAgent } = useCurrentAgent();
  return useQuery({
    queryKey: ["onboardingState", currentAgent?.tenant_id],
    queryFn: async (): Promise<OnboardingState | null> => {
      if (!currentAgent?.tenant_id) return null;
      const { data, error } = await supabase
        .from("tenant_onboarding_state" as any)
        .select("tenant_id, step_completed, payload, completed_at, updated_at")
        .eq("tenant_id", currentAgent.tenant_id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as OnboardingState | null) ?? null;
    },
    enabled: !!currentAgent?.tenant_id,
    staleTime: 30 * 1000,
  });
}

/**
 * Upsert wizard progress. The wizard calls this at the end of each step
 * with the cumulative payload + the highest step the owner has reached.
 */
export function useUpdateOnboardingState() {
  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();

  return useMutation({
    mutationFn: async (params: {
      step_completed?: number;
      payload?: Record<string, unknown>;
      completed_at?: string | null;
    }) => {
      if (!currentAgent?.tenant_id) throw new Error("No tenant");
      const row: Record<string, unknown> = {
        tenant_id: currentAgent.tenant_id,
      };
      if (params.step_completed != null) row.step_completed = params.step_completed;
      if (params.payload != null) row.payload = params.payload;
      if (params.completed_at !== undefined) row.completed_at = params.completed_at;

      const { error } = await supabase
        .from("tenant_onboarding_state" as any)
        .upsert(row as any, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboardingState"] });
    },
  });
}

/**
 * Completion percentage based on real data, not just the wizard cursor.
 * Each criterion contributes evenly. Used by:
 *   - the home page banner ("Finish setting up — 67%")
 *   - the wizard's progress header
 *   - ProtectedRoute's auto-redirect (only redirects if no minimum-viable
 *     setup yet)
 */
export interface OnboardingProgress {
  agencyProfileSet: boolean;
  hasPositions: boolean;
  hasCarrier: boolean;
  hasInvitedAgent: boolean;
  webhookConfigured: boolean;
  markedComplete: boolean;
  /** 0..100 */
  percent: number;
  /** Minimum-viable setup: positions, at least one carrier, at least one invited agent. */
  minimumViable: boolean;
}

export function useOnboardingProgress(): OnboardingProgress | null {
  const { data: currentAgent } = useCurrentAgent();

  const { data } = useQuery({
    queryKey: ["onboardingProgress", currentAgent?.tenant_id],
    queryFn: async (): Promise<OnboardingProgress | null> => {
      if (!currentAgent?.tenant_id) return null;
      const tid = currentAgent.tenant_id;

      const [tenantRes, posRes, carrRes, invRes, agentsRes, hookRes, stateRes] = await Promise.all([
        supabase.from("tenants").select("agency_name, time_zone, default_annual_goal").eq("id", tid).maybeSingle(),
        supabase.from("positions").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
        supabase.from("carriers").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
        supabase.from("invites").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
        supabase.from("agents").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
        supabase.from("webhook_configs").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
        supabase.from("tenant_onboarding_state" as any).select("completed_at").eq("tenant_id", tid).maybeSingle(),
      ]);

      const tenant = tenantRes.data as { agency_name: string | null; time_zone: string | null; default_annual_goal: number | null } | null;

      const agencyProfileSet = !!(tenant?.agency_name && tenant.time_zone);
      const hasPositions = (posRes.count ?? 0) > 0;
      const hasCarrier = (carrRes.count ?? 0) > 0;
      const hasInvitedAgent = (invRes.count ?? 0) > 0 || (agentsRes.count ?? 0) > 1;
      const webhookConfigured = (hookRes.count ?? 0) > 0;
      const markedComplete = !!(stateRes.data as unknown as { completed_at: string | null } | null)?.completed_at;

      // 6 indicators. Webhook is optional (still counts when present).
      const checks = [
        agencyProfileSet,
        hasPositions,
        hasCarrier,
        hasInvitedAgent,
        webhookConfigured,
        markedComplete,
      ];
      const percent = Math.round((checks.filter(Boolean).length / checks.length) * 100);

      return {
        agencyProfileSet,
        hasPositions,
        hasCarrier,
        hasInvitedAgent,
        webhookConfigured,
        markedComplete,
        percent,
        minimumViable: hasPositions && hasCarrier && hasInvitedAgent,
      };
    },
    enabled: !!currentAgent?.tenant_id,
    staleTime: 30 * 1000,
  });

  return data ?? null;
}
