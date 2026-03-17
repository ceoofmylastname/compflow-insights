import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { toast } from "sonner";
import type { CarrierProfile, CustomField } from "@/lib/carrier-import-engine";

export function useCarrierProfiles() {
  const { data: currentAgent } = useCurrentAgent();

  return useQuery({
    queryKey: ["carrierProfiles", currentAgent?.tenant_id],
    queryFn: async (): Promise<CarrierProfile[]> => {
      const { data, error } = await supabase
        .from("carrier_profiles")
        .select("*")
        .eq("tenant_id", currentAgent!.tenant_id)
        .order("carrier_name");

      if (error) throw error;
      return (data ?? []) as CarrierProfile[];
    },
    enabled: !!currentAgent?.tenant_id,
  });
}

export function useCreateCarrierProfile() {
  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();

  return useMutation({
    mutationFn: async (params: {
      carrier_name: string;
      column_mappings: Record<string, string>;
      custom_fields: CustomField[];
      header_fingerprint: string[];
    }) => {
      if (!currentAgent) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("carrier_profiles")
        .upsert(
          {
            tenant_id: currentAgent.tenant_id,
            carrier_name: params.carrier_name,
            column_mappings: params.column_mappings,
            custom_fields: params.custom_fields as any,
            header_fingerprint: params.header_fingerprint,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "tenant_id,carrier_name", ignoreDuplicates: false }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carrierProfiles"] });
      toast.success("Carrier profile saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteCarrierProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("carrier_profiles")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carrierProfiles"] });
      toast.success("Carrier profile deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
