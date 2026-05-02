import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { toast } from "sonner";

export interface CarrierProduct {
  id: string;
  carrier_id: string;
  name: string;
  type: string | null;
  product_type: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Carrier {
  id: string;
  tenant_id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  website: string | null;
  phone: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  carrier_products?: CarrierProduct[];
}

export function useCarriers() {
  const { data: currentAgent } = useCurrentAgent();
  const queryClient = useQueryClient();

  const query = useQuery({
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
    staleTime: 2 * 60 * 1000,
  });

  // Realtime subscription on the carriers table per
  // Wiki/realtime-updates-and-hierarchy-cascade.md. Owner inserts,
  // updates (status flips, name edits), or deletes a carrier and every
  // active agent session in the tenant sees the change inside ~1s
  // without a page refresh — the channel filter is server-side
  // (tenant_id eq) so cross-tenant traffic never reaches the client.
  //
  // The subscription is intentionally narrow: it just invalidates the
  // carriers query. TanStack refetches, every dropdown re-derives from
  // the same source of truth, and useCarrierOptions consumers update.
  // Carrier-products mutations also reach the carriers query via the
  // refetch (since the select pulls carrier_products in the same call).
  useEffect(() => {
    const tenantId = currentAgent?.tenant_id;
    if (!tenantId) return;
    const channel = supabase
      .channel(`carriers:tenant=${tenantId}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "carriers", filter: `tenant_id=eq.${tenantId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["carriers", tenantId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentAgent?.tenant_id, queryClient]);

  return query;
}

export function useCreateCarrier() {
  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();

  return useMutation({
    mutationFn: async (params: { name: string; short_name?: string; logo_url?: string; website?: string; phone?: string; notes?: string }) => {
      if (!currentAgent) throw new Error("Not authenticated");
      const { error } = await supabase.from("carriers").insert({
        tenant_id: currentAgent.tenant_id,
        name: params.name.trim(),
        short_name: params.short_name?.trim() || null,
        logo_url: params.logo_url?.trim() || null,
        website: params.website?.trim() || null,
        phone: params.phone?.trim() || null,
        notes: params.notes?.trim() || null,
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
    mutationFn: async (params: { id: string; name?: string; short_name?: string; logo_url?: string; website?: string; phone?: string; notes?: string; status?: string }) => {
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
    mutationFn: async (params: { carrier_id: string; name: string; type?: string; product_type?: string }) => {
      const { error } = await supabase.from("carrier_products").insert({
        carrier_id: params.carrier_id,
        name: params.name.trim(),
        type: params.type?.trim() || null,
        product_type: params.product_type?.trim() || null,
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
