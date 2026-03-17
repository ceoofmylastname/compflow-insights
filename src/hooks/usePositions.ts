import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { toast } from "sonner";
import { QUERY_KEYS } from "@/lib/query-keys";
import type { Tables } from "@/integrations/supabase/types";

export type Position = Tables<"positions">;

export function usePositions() {
  return useQuery({
    queryKey: [...QUERY_KEYS.positions],
    queryFn: async (): Promise<Position[]> => {
      const { data, error } = await supabase
        .from("positions")
        .select("*")
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Position[];
    },
  });
}

export function usePositionOptions() {
  const { data: positions, isLoading } = usePositions();
  const positionTitles = (positions ?? []).map((p) => p.title).sort();
  return { positions: positionTitles, isLoading };
}

export function useCreatePosition() {
  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();

  return useMutation({
    mutationFn: async (params: { title: string; priority?: number }) => {
      if (!currentAgent) throw new Error("Not authenticated");
      const { error } = await supabase.from("positions").insert({
        tenant_id: currentAgent.tenant_id,
        title: params.title.trim(),
        priority: params.priority ?? 0,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.positions] });
      toast.success("Position added");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdatePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; title?: string; priority?: number }) => {
      const { id, ...updates } = params;
      const { error } = await supabase.from("positions").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.positions] });
      toast.success("Position updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeletePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("positions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.positions] });
      toast.success("Position deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
