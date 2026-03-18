import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

export type AgentContract = Tables<"agent_contracts">;

export function useAgentContracts(agentId?: string | "all") {
  return useQuery({
    queryKey: ["agentContracts", agentId ?? "all"],
    queryFn: async (): Promise<AgentContract[]> => {
      let query = supabase
        .from("agent_contracts")
        .select("*")
        .order("carrier");

      if (agentId && agentId !== "all") {
        query = query.eq("agent_id", agentId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AgentContract[];
    },
    enabled: agentId === "all" || !!agentId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateAgentContract() {
  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();

  return useMutation({
    mutationFn: async (params: {
      agent_id: string;
      carrier: string;
      agent_number?: string;
      contract_type: string;
      status: string;
      start_date?: string;
    }) => {
      if (!currentAgent) throw new Error("Not authenticated");
      const { error } = await supabase.from("agent_contracts").insert({
        tenant_id: currentAgent.tenant_id,
        agent_id: params.agent_id,
        carrier: params.carrier,
        agent_number: params.agent_number || null,
        contract_type: params.contract_type,
        status: params.status,
        start_date: params.start_date || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agentContracts"] });
      toast.success("Contract added");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteAgentContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agent_contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agentContracts"] });
      toast.success("Contract deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
