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
  excludeAgentId?: string;
  leadSource?: string;
  page?: number;
  pageSize?: number;
  /**
   * When true, restrict to orphan policies (resolved_agent_id IS NULL).
   * Owner-only in practice — non-owner agents don't see orphans via RLS,
   * so this filter is a no-op for them. Per Wiki/carrier-ingest-pipeline.md
   * (orphan auto-link mechanism, 2026-05-02).
   */
  unassigned?: boolean;
}

export interface PaginatedPolicies {
  data: Policy[];
  count: number;
  page: number;
  pageSize: number;
}

export function usePolicies(filters: PolicyFilters = {}) {
  const isPaginated = filters.page != null;

  return useQuery({
    queryKey: ["policies", filters],
    queryFn: async (): Promise<Policy[] | PaginatedPolicies> => {
      const page = filters.page ?? 1;
      const pageSize = filters.pageSize ?? 50;

      let query = supabase.from("policies").select("*", isPaginated ? { count: "exact" } : undefined);

      // Exclude drafts from Book of Business / production listings.
      // Drafts live in the Drafts page and are private to the creator.
      // status='Draft' is the canonical marker (Wiki/book-of-business-page.md).
      query = query.neq("status", "Draft");

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
      if (filters.excludeAgentId) {
        query = query.neq("resolved_agent_id", filters.excludeAgentId);
      }
      if (filters.leadSource) {
        query = query.eq("lead_source", filters.leadSource);
      }
      if (filters.search) {
        query = query.ilike("client_name", `%${filters.search}%`);
      }
      if (filters.unassigned) {
        query = query.is("resolved_agent_id", null);
      }

      query = query.order("created_at", { ascending: false });

      if (isPaginated) {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);
      } else if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      if (isPaginated) {
        return { data: data ?? [], count: count ?? 0, page, pageSize } as PaginatedPolicies;
      }

      return (data ?? []) as Policy[];
    },
  });
}

/** Type guard helper for paginated results */
export function isPaginatedResult(result: Policy[] | PaginatedPolicies | undefined): result is PaginatedPolicies {
  return result != null && !Array.isArray(result) && "page" in result;
}

/** Helper to extract the array from either result type */
export function getPoliciesArray(result: Policy[] | PaginatedPolicies | undefined): Policy[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  return result.data;
}
