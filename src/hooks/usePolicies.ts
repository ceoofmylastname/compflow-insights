import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Policy = Tables<"policies">;

export interface PolicyFilters {
  status?: string[];
  carrier?: string;
  agentId?: string;
  contractType?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
  resolvedAgentId?: string;
}

export function usePolicies(filters: PolicyFilters = {}) {
  return useQuery({
    queryKey: ["policies", filters],
    queryFn: async (): Promise<Policy[]> => {
      let query = supabase.from("policies").select("*");

      if (filters.status && filters.status.length > 0) {
        query = query.in("status", filters.status);
      }
      if (filters.carrier) {
        query = query.eq("carrier", filters.carrier);
      }
      if (filters.agentId) {
        query = query.eq("resolved_agent_id", filters.agentId);
      }
      if (filters.resolvedAgentId) {
        query = query.eq("resolved_agent_id", filters.resolvedAgentId);
      }
      if (filters.contractType) {
        query = query.eq("contract_type", filters.contractType);
      }
      if (filters.dateFrom) {
        query = query.gte("application_date", filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte("application_date", filters.dateTo);
      }
      if (filters.search) {
        query = query.ilike("client_name", `%${filters.search}%`);
      }

      query = query.order("created_at", { ascending: false });

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}
