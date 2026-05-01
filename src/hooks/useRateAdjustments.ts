import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { toast } from "sonner";
import { QUERY_KEYS } from "@/lib/query-keys";
import type { Tables } from "@/integrations/supabase/types";

type RawRateAdjustment = Tables<"commission_rate_adjustments">;

/**
 * RateAdjustment as used in the app. `position` injected from joined positions
 * row, sourced from the FK position_id (not the legacy TEXT column).
 */
export interface RateAdjustment extends Omit<RawRateAdjustment, "position"> {
  position: string;
  position_id: string;
}

export function useRateAdjustments() {
  return useQuery({
    queryKey: [...QUERY_KEYS.rateAdjustments],
    queryFn: async (): Promise<RateAdjustment[]> => {
      const { data, error } = await supabase
        .from("commission_rate_adjustments")
        .select("*, positions:position_id (id, title, priority)")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        ...(row as RawRateAdjustment),
        position: row.positions?.title ?? "",
        position_id: (row as any).position_id ?? row.positions?.id ?? "",
      })) as RateAdjustment[];
    },
  });
}

export function useCreateRateAdjustment() {
  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();

  return useMutation({
    mutationFn: async (params: {
      carrier: string;
      product: string;
      position_id: string;
      adjustment_rate: number;
      start_date: string;
      end_date?: string;
      reason?: string;
    }) => {
      if (!currentAgent) throw new Error("Not authenticated");
      const { error } = await supabase.from("commission_rate_adjustments").insert({
        tenant_id: currentAgent.tenant_id,
        carrier: params.carrier,
        product: params.product,
        position_id: params.position_id,
        adjustment_rate: params.adjustment_rate,
        start_date: params.start_date,
        end_date: params.end_date || null,
        reason: params.reason || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.rateAdjustments] });
      toast.success("Rate adjustment added");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteRateAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("commission_rate_adjustments")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.rateAdjustments] });
      toast.success("Rate adjustment deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
