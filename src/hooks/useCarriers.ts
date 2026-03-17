import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { toast } from "sonner";

export interface CarrierProduct {
  id: string;
  carrier_id: string;
  name: string;
  type: string | null;
  created_at: string;
}

export interface Carrier {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
  created_at: string;
  carrier_products?: CarrierProduct[];
}

export function useCarriers() {
  const { data: currentAgent } = useCurrentAgent();
  return useQuery({
    queryKey: ["carriers", currentAgent?.tenant_id],
    queryFn: async (): Promise<Carrier[]> => {
      if (!currentAgent) return [];
      const { data, error } = await supabase
        .from("carriers")
        .select("*, carrier_products(*)")
        .eq("tenant_id", currentAgent.tenant_id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Carrier[];
    },
    enabled: !!currentAgent,
  });
}

export function useCreateCarrier() {
  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();

  return useMutation({
    mutationFn: async (params: { name: string }) => {
      if (!currentAgent) throw new Error("Not authenticated");
      const { error } = await supabase.from("carriers").insert({
        tenant_id: currentAgent.tenant_id,
        name: params.name.trim(),
        status: "active",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carriers"] });
      toast.success("Carrier added");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateCarrier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; name?: string; status?: string }) => {
      const { id, ...updates } = params;
      const { error } = await supabase.from("carriers").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carriers"] });
      toast.success("Carrier updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteCarrier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("carriers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carriers"] });
      toast.success("Carrier deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCreateCarrierProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { carrier_id: string; name: string; type?: string }) => {
      const { error } = await supabase.from("carrier_products").insert({
        carrier_id: params.carrier_id,
        name: params.name.trim(),
        type: params.type?.trim() || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carriers"] });
      toast.success("Product added");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteCarrierProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("carrier_products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carriers"] });
      toast.success("Product deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
