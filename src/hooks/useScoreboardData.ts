import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAgents } from "@/hooks/useAgents";

export interface ScoreRow {
  agentId: string;
  name: string;
  position: string;
  policies: number;
  totalPremium: number;
  totalCommission: number;
  goalProgress: number;
  annualGoal: number;
}

interface ScoreboardFilters {
  dateFrom?: string;
  dateTo?: string;
  carrier?: string;
  status?: string;
  leadSource?: string;
  rankMode?: "All" | "Submitted" | "Active";
}

function usePoliciesForScoreboard(filters: ScoreboardFilters) {
  return useQuery({
    queryKey: ["scoreboardPolicies", filters],
    queryFn: async () => {
      let query = supabase
        .from("policies")
        .select("id, resolved_agent_id, annual_premium, carrier, status, lead_source, application_date")
        .or("is_draft.is.null,is_draft.eq.false");

      if (filters.dateFrom) query = query.gte("application_date", filters.dateFrom);
      if (filters.dateTo) query = query.lte("application_date", filters.dateTo);
      if (filters.carrier) query = query.eq("carrier", filters.carrier);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.rankMode && filters.rankMode !== "All") query = query.eq("status", filters.rankMode);
      if (filters.leadSource) query = query.eq("lead_source", filters.leadSource);

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function usePayoutsForScoreboard(filters: ScoreboardFilters) {
  return useQuery({
    queryKey: ["scoreboardPayouts", filters],
    queryFn: async () => {
      const needsInner = !!(filters.dateFrom || filters.dateTo || filters.carrier || filters.status || filters.leadSource || (filters.rankMode && filters.rankMode !== "All"));
      let query = supabase
        .from("commission_payouts")
        .select(
          needsInner
            ? "id, agent_id, policy_id, commission_amount, policies!inner(application_date, carrier, status, lead_source)"
            : "id, agent_id, policy_id, commission_amount, policies(application_date, carrier, status, lead_source)"
        );

      if (filters.dateFrom) query = query.gte("policies.application_date", filters.dateFrom);
      if (filters.dateTo) query = query.lte("policies.application_date", filters.dateTo);
      if (filters.carrier) query = query.eq("policies.carrier", filters.carrier);
      if (filters.status) query = query.eq("policies.status", filters.status);
      if (filters.rankMode && filters.rankMode !== "All") query = query.eq("policies.status", filters.rankMode);
      if (filters.leadSource) query = query.eq("policies.lead_source", filters.leadSource);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; agent_id: string; policy_id: string; commission_amount: number | null }[];
    },
  });
}

export function useScoreboardData(filters: ScoreboardFilters) {
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: policies, isLoading: policiesLoading, error: policiesError, refetch: refetchPolicies } = usePoliciesForScoreboard(filters);
  const { data: payouts, isLoading: payoutsLoading } = usePayoutsForScoreboard(filters);

  const scoreData = useMemo((): ScoreRow[] => {
    if (!agents || !policies) return [];

    // Aggregate policies by resolved_agent_id
    const policyMap = new Map<string, { premium: number; policyCount: number }>();
    for (const p of policies) {
      if (!p.resolved_agent_id) continue;
      const existing = policyMap.get(p.resolved_agent_id) || { premium: 0, policyCount: 0 };
      existing.premium += p.annual_premium || 0;
      existing.policyCount += 1;
      policyMap.set(p.resolved_agent_id, existing);
    }

    // Aggregate commission from payouts
    const commMap = new Map<string, number>();
    if (payouts) {
      for (const p of payouts) {
        commMap.set(p.agent_id, (commMap.get(p.agent_id) || 0) + (p.commission_amount || 0));
      }
    }

    // Merge: any agent with policies OR payouts
    const allAgentIds = new Set([...policyMap.keys(), ...commMap.keys()]);

    return agents
      .filter((a) => allAgentIds.has(a.id))
      .map((agent) => {
        const pAgg = policyMap.get(agent.id);
        const commission = commMap.get(agent.id) || 0;
        const goal = Number(agent.annual_goal) || 0;
        return {
          agentId: agent.id,
          name: `${agent.first_name} ${agent.last_name}`,
          position: agent.position || "--",
          policies: pAgg?.policyCount || 0,
          totalPremium: pAgg?.premium || 0,
          totalCommission: commission,
          goalProgress: goal > 0 ? (commission / goal) * 100 : 0,
          annualGoal: goal,
        };
      })
      .sort((a, b) => b.totalPremium - a.totalPremium);
  }, [agents, policies, payouts]);

  // Lead sources from policies for filter dropdown
  const leadSources = useMemo(() => {
    if (!policies) return [];
    const set = new Set<string>();
    policies.forEach((p) => { if (p.lead_source) set.add(p.lead_source); });
    return [...set].sort();
  }, [policies]);

  return {
    scoreData,
    leadSources,
    isLoading: agentsLoading || policiesLoading || payoutsLoading,
    error: policiesError,
    refetch: refetchPolicies,
  };
}
