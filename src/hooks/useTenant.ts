import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

// Extend the base tenant type with domain columns that may not yet be in the auto-generated types
export type Tenant = Tables<"tenants"> & {
  subdomain?: string | null;
  custom_domain?: string | null;
  cloudflare_hostname_id?: string | null;
  domain_txt_verification?: string | null;
  domain_verified?: boolean;
  domain_status?: string;
  plan?: string | null;
};

export function useTenant() {
  const { data: currentAgent } = useCurrentAgent();

  return useQuery({
    queryKey: ["tenant", currentAgent?.tenant_id],
    queryFn: async (): Promise<Tenant | null> => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", currentAgent!.tenant_id)
        .single();

      if (error) throw error;
      return data as Tenant | null;
    },
    enabled: !!currentAgent?.tenant_id,
  });
}

export function useUpdateTenant() {
  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();

  return useMutation({
    mutationFn: async (params: {
      agency_name?: string | null;
      logo_url?: string | null;
      primary_color?: string | null;
    }) => {
      if (!currentAgent) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("tenants")
        .update(params)
        .eq("id", currentAgent.tenant_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant"] });
      toast.success("Agency settings saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
