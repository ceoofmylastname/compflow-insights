import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DomainTenant {
  id: string;
  name: string;
  agency_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  subdomain: string | null;
  custom_domain: string | null;
  domain_verified: boolean;
  plan: string | null;
}

const APP_HOSTNAME = import.meta.env.VITE_APP_HOSTNAME || "baseshophq.com";

export function useTenantFromDomain() {
  const hostname = window.location.hostname;

  const isAppHostname =
    hostname === APP_HOSTNAME ||
    hostname === `www.${APP_HOSTNAME}` ||
    hostname === `app.${APP_HOSTNAME}` ||
    hostname === "localhost" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("192.168.");

  return useQuery({
    queryKey: ["tenantFromDomain", hostname],
    queryFn: async (): Promise<DomainTenant | null> => {
      if (isAppHostname) return null;

      const { data, error } = await (supabase.rpc as any)("resolve_tenant_by_domain", {
        p_hostname: hostname,
      });

      if (error || !data || (Array.isArray(data) && data.length === 0)) return null;
      return (Array.isArray(data) ? data[0] : data) as DomainTenant;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function getSubdomainFromHostname(): string | null {
  const hostname = window.location.hostname;
  const appHostname = import.meta.env.VITE_APP_HOSTNAME || "baseshophq.com";
  if (hostname.endsWith(`.${appHostname}`)) {
    return hostname.replace(`.${appHostname}`, "");
  }
  return null;
}
