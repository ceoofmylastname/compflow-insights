import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAgents } from "@/hooks/useAgents";

export interface CommissionPayout {
  id: string;
  policy_id: string;
  agent_id: string;
  tenant_id: string;
  commission_rate: number | null;
  commission_amount: number | null;
  payout_type: string;
  contract_type: string | null;
  calculated_at: string;
  agent_name?: string;
  agent_position?: string;
}

export interface PayoutFilters {
  agentId?: string;
  policyId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useCommissionPayouts(filters: PayoutFilters = {}) {
  const { data: agents } = useAgents();

  return useQuery({
    queryKey: ["commissionPayouts", filters],
    queryFn: async (): Promise<CommissionPayout[]> => {
      let query = supabase.from("commission_payouts").select("*");

      if (filters.agentId) {
        query = query.eq("agent_id", filters.agentId);
      }
      if (filters.policyId) {
        query = query.eq("policy_id", filters.policyId);
      }
      if (filters.dateFrom) {
        query = query.gte("calculated_at", filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte("calculated_at", filters.dateTo);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Enrich with agent names client-side
      const rows = (data ?? []) as any[];
      return rows.map((r) => {
        const agent = agents?.find((a) => a.id === r.agent_id);
        return {
          ...r,
          payout_type: r.payout_type ?? "direct",
          contract_type: r.contract_type ?? null,
          agent_name: agent ? `${agent.first_name} ${agent.last_name}` : "--",
          agent_position: agent?.position ?? "--",
        } as CommissionPayout;
      });
    },
    enabled: !!agents,
  });
}
