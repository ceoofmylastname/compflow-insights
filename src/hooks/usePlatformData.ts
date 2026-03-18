import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TenantSummary {
  tenant_id: string;
  tenant_name: string;
  agency_name: string | null;
  subdomain: string | null;
  custom_domain: string | null;
  domain_verified: boolean;
  logo_url: string | null;
  owner_email: string;
  owner_name: string;
  plan: string;
  total_agents: number;
  active_agents_30d: number;
  total_policies: number;
  total_premium: number;
  created_at: string;
  last_policy_date: string | null;
  webhook_count: number;
}

export interface TenantDetail {
  tenant: any;
  agents: any[];
  policies: any[];
  carriers: any[];
  commissionLevels: any[];
  webhooks: any[];
}

async function callPlatformEdge(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const { data, error } = await supabase.functions.invoke("get-platform-data" + qs, {
    method: "GET",
  });
  if (error) throw error;
  return data;
}

export function usePlatformTenants() {
  return useQuery<TenantSummary[]>({
    queryKey: ["platformTenants"],
    queryFn: () => callPlatformEdge(),
    staleTime: 60_000,
  });
}

export function usePlatformTenantDetail(tenantId: string | undefined) {
  return useQuery<TenantDetail>({
    queryKey: ["platformTenantDetail", tenantId],
    queryFn: () => callPlatformEdge({ tenantId: tenantId! }),
    enabled: !!tenantId,
    staleTime: 60_000,
  });
}
