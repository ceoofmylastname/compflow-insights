import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useAgents } from "@/hooks/useAgents";

export function useCanImport(): { canImport: boolean; isLoading: boolean } {
  const { data: currentAgent, isLoading: agentLoading } = useCurrentAgent();
  const { data: agents, isLoading: agentsLoading } = useAgents();

  const isOwner = currentAgent?.is_owner === true;
  const isManager = (agents ?? []).some(
    (a) => a.upline_email === currentAgent?.email
  );

  return {
    canImport: isOwner || isManager,
    isLoading: agentLoading || agentsLoading,
  };
}
