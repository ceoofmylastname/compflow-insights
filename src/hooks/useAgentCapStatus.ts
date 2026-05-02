import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";

export interface AgentCapStatus {
  tier: "starter" | "growth" | "pro" | "enterprise" | null;
  cap: number | null;
  current: number;
  remaining: number | null;
  pct_used: number;
  near_cap: boolean;
  at_cap: boolean;
}

/**
 * Read the current tenant's agent cap usage. Fueled by the
 * tenant_agent_cap_status RPC (migration 20260506000000_tier_billing).
 *
 * Used in three places:
 *   - InviteAgentModal: pre-check before submitting an invite, surface
 *     a friendly "Upgrade to add more agents" CTA when at cap.
 *   - Home page: 90% warning banner (Prompt 4 will consume `near_cap`).
 *   - Billing page: cap usage progress bar in the tier card.
 *
 * Stale time is short (15s) so cap usage feels responsive after invites.
 * Owner-or-self queries are filtered by RLS already; this hook just shapes
 * the result.
 */
export function useAgentCapStatus() {
  const { data: currentAgent } = useCurrentAgent();
  return useQuery({
    queryKey: ["agentCapStatus", currentAgent?.tenant_id],
    queryFn: async (): Promise<AgentCapStatus | null> => {
      if (!currentAgent?.tenant_id) return null;
      const { data, error } = await supabase.rpc(
        "tenant_agent_cap_status" as any,
        { p_tenant_id: currentAgent.tenant_id }
      );
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        tier: row.tier,
        cap: row.cap,
        current: row.current,
        remaining: row.remaining,
        pct_used: Number(row.pct_used) || 0,
        near_cap: !!row.near_cap,
        at_cap: !!row.at_cap,
      };
    },
    enabled: !!currentAgent?.tenant_id,
    staleTime: 15 * 1000,
  });
}
