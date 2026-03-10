import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type CommissionPayout = Tables<"commission_payouts">;

export interface PayoutFilters {
  agentId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useCommissionPayouts(filters: PayoutFilters = {}) {
  return useQuery({
    queryKey: ["commissionPayouts", filters],
    queryFn: async (): Promise<CommissionPayout[]> => {
      let query = supabase.from("commission_payouts").select("*");

      if (filters.agentId) {
        query = query.eq("agent_id", filters.agentId);
      }
      if (filters.dateFrom) {
        query = query.gte("calculated_at", filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte("calculated_at", filters.dateTo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}
