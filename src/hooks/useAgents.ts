import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { toast } from "sonner";
import { QUERY_KEYS } from "@/lib/query-keys";
import type { Tables } from "@/integrations/supabase/types";

type RawAgent = Tables<"agents">;

/**
 * Agent shape used throughout the app. The `position` field is INJECTED from
 * the agent_current_positions view (FK-based time-stamped position record),
 * not the legacy agents.position TEXT column. This lets every consumer keep
 * reading `agent.position` after the TEXT column is dropped.
 */
export interface Agent extends Omit<RawAgent, "position"> {
  position: string | null;
  position_id: string | null;
  position_priority: number | null;
}

interface CurrentPositionRow {
  agent_id: string;
  position_id: string;
  position_title: string;
  position_priority: number | null;
}

async function fetchAgentsWithPositions(filterFn: (q: any) => any): Promise<Agent[]> {
  const [agentsRes, posRes] = await Promise.all([
    filterFn(supabase.from("agents").select("*")),
    supabase
      .from("agent_current_positions" as any)
      .select("agent_id, position_id, position_title, position_priority"),
  ]);
  if (agentsRes.error) throw agentsRes.error;
  if (posRes.error) throw posRes.error;

  const posMap = new Map<string, CurrentPositionRow>();
  for (const p of (posRes.data ?? []) as unknown as CurrentPositionRow[]) {
    posMap.set(p.agent_id, p);
  }

  return ((agentsRes.data ?? []) as RawAgent[]).map((a) => {
    const p = posMap.get(a.id);
    return {
      ...a,
      position: p?.position_title ?? null,
      position_id: p?.position_id ?? null,
      position_priority: p?.position_priority ?? null,
    } as Agent;
  });
}

export function useAgents() {
  return useQuery({
    queryKey: [...QUERY_KEYS.agents],
    queryFn: async (): Promise<Agent[]> => {
      return fetchAgentsWithPositions((q) => q.neq("is_archived", true).order("last_name"));
    },
  });
}

export function useArchivedAgents() {
  return useQuery({
    queryKey: [...QUERY_KEYS.archivedAgents],
    queryFn: async (): Promise<Agent[]> => {
      return fetchAgentsWithPositions((q) => q.eq("is_archived", true).order("archived_at", { ascending: false }));
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

export function useDeleteAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (agentId: string) => {
      const { error } = await supabase
        .from("agents")
        .delete()
        .eq("id", agentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.agents] });
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.archivedAgents] });
      toast.success("Agent permanently deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDownlineAgents(currentAgentId?: string) {
  const query = useAgents();
  const downline = (query.data ?? []).filter((a) => a.id !== currentAgentId);
  return { ...query, data: downline };
}
