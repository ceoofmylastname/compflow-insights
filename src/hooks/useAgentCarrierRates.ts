/**
 * Per-agent commission rate overrides per Wiki/comp-grid-engine.md
 * ("Per-agent rate overrides" section, 2026-05-02).
 *
 * Owner-managed only. Agents have read-only access via SELECT RLS
 * scoped to their own agent_id. The commission engine resolves
 * agent-first then falls back to position-based commission_levels.
 *
 * setRate() time-stamps every transition: any prior open row for the
 * same (agent, carrier, product) gets end_date set to today, and a
 * new row is inserted with start_date = today. Yesterday's policies
 * still resolve to the prior rate; today's pick up the new rate.
 */

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { toast } from "sonner";

export interface AgentCarrierRate {
  id: string;
  tenant_id: string;
  agent_id: string;
  carrier: string;
  product: string | null;
  rate: number;
  start_date: string;
  end_date: string | null;
  set_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch all per-agent rate overrides for an agent, oldest first.
 * Filter to active rows in the consumer when needed.
 */
export function useAgentCarrierRates(agentId?: string) {
  const { data: currentAgent } = useCurrentAgent();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["agentCarrierRates", agentId, currentAgent?.tenant_id],
    queryFn: async (): Promise<AgentCarrierRate[]> => {
      if (!currentAgent || !agentId) return [];
      const { data, error } = await supabase
        .from("agent_carrier_rates" as any)
        .select("*")
        .eq("tenant_id", currentAgent.tenant_id)
        .eq("agent_id", agentId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AgentCarrierRate[];
    },
    enabled: !!currentAgent && !!agentId,
    staleTime: 60 * 1000,
  });

  // Realtime subscription: an owner editing rates from another tab or
  // session should reflect immediately in this view (and in the
  // agent's read-only My Rates page).
  useEffect(() => {
    const tenantId = currentAgent?.tenant_id;
    if (!tenantId || !agentId) return;
    const channel = supabase
      .channel(`agent_carrier_rates:${tenantId}:${agentId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "agent_carrier_rates",
          filter: `agent_id=eq.${agentId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["agentCarrierRates", agentId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentAgent?.tenant_id, agentId, queryClient]);

  return query;
}

/**
 * setAgentRate: close any prior open row for (agent, carrier, product)
 * with end_date=today, then INSERT a new row with the new rate and
 * start_date=today. Idempotent in the sense that re-applying the same
 * rate produces a fresh history row but never breaks math.
 */
export function useSetAgentRate() {
  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();

  return useMutation({
    mutationFn: async (params: {
      agentId: string;
      carrier: string;
      product: string | null;
      rate: number;
    }) => {
      if (!currentAgent) throw new Error("Not authenticated");
      const today = new Date().toISOString().slice(0, 10);

      // Close any active rows for this (agent, carrier, product).
      // Active = end_date IS NULL. We don't touch rows that are
      // already closed.
      const closeQuery = (supabase
        .from("agent_carrier_rates" as any)
        .update({ end_date: today } as any)
        .eq("tenant_id", currentAgent.tenant_id)
        .eq("agent_id", params.agentId)
        .eq("carrier", params.carrier)
        .is("end_date", null)) as any;
      const closed = params.product == null
        ? await closeQuery.is("product", null)
        : await closeQuery.eq("product", params.product);
      if (closed.error) throw closed.error;

      const { error: insertError } = await supabase
        .from("agent_carrier_rates" as any)
        .insert({
          tenant_id: currentAgent.tenant_id,
          agent_id: params.agentId,
          carrier: params.carrier,
          product: params.product,
          rate: params.rate,
          start_date: today,
          set_by_user_id: currentAgent.id,
        } as any);
      if (insertError) throw insertError;
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ["agentCarrierRates", params.agentId] });
      toast.success(`Rate set to ${(params.rate * 100).toFixed(0)}%`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/**
 * clearAgentRate: end_date the active override row for (agent, carrier,
 * product) without inserting a new one. Engine falls back to
 * position-based commission_levels for future policies.
 */
export function useClearAgentRate() {
  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();

  return useMutation({
    mutationFn: async (params: {
      agentId: string;
      carrier: string;
      product: string | null;
    }) => {
      if (!currentAgent) throw new Error("Not authenticated");
      const today = new Date().toISOString().slice(0, 10);
      const closeQuery = (supabase
        .from("agent_carrier_rates" as any)
        .update({ end_date: today } as any)
        .eq("tenant_id", currentAgent.tenant_id)
        .eq("agent_id", params.agentId)
        .eq("carrier", params.carrier)
        .is("end_date", null)) as any;
      const result = params.product == null
        ? await closeQuery.is("product", null)
        : await closeQuery.eq("product", params.product);
      if (result.error) throw result.error;
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ["agentCarrierRates", params.agentId] });
      toast.success("Override removed; using position default");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
