import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { toast } from "sonner";
import { QUERY_KEYS } from "@/lib/query-keys";
import type { Tables } from "@/integrations/supabase/types";

export type Agent = Tables<"agents">;

export function useAgents() {
  return useQuery({
    queryKey: [...QUERY_KEYS.agents],
    queryFn: async (): Promise<Agent[]> => {
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .neq("is_archived", true)
        .order("last_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useArchivedAgents() {
  return useQuery({
    queryKey: [...QUERY_KEYS.archivedAgents],
    queryFn: async (): Promise<Agent[]> => {
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .eq("is_archived", true)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useArchiveAgent() {
  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();

  return useMutation({
    mutationFn: async (agentId: string) => {
      if (!currentAgent) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("agents")
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: currentAgent.id,
        } as any)
        .eq("id", agentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.agents] });
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.archivedAgents] });
      toast.success("Agent archived");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRestoreAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (agentId: string) => {
      const { error } = await supabase
        .from("agents")
        .update({
          is_archived: false,
          archived_at: null,
          archived_by: null,
        } as any)
        .eq("id", agentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.agents] });
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.archivedAgents] });
      toast.success("Agent restored");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDownlineAgents(currentAgentId?: string) {
  const query = useAgents();
  const downline = (query.data ?? []).filter((a) => a.id !== currentAgentId);
  return { ...query, data: downline };
}
