import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Tables } from "@/integrations/supabase/types";

type RawAgent = Tables<"agents">;

/**
 * Same augmented shape as Agent in useAgents — `position` injected from the
 * agent_current_positions view, not the legacy TEXT column.
 */
export interface Agent extends Omit<RawAgent, "position"> {
  position: string | null;
  position_id: string | null;
  position_priority: number | null;
}

export function useCurrentAgent() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["currentAgent", user?.id],
    queryFn: async (): Promise<Agent | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const { data: posData } = await supabase
        .from("agent_current_positions" as any)
        .select("position_id, position_title, position_priority")
        .eq("agent_id", data.id)
        .maybeSingle();

      const pos = posData as unknown as { position_id: string; position_title: string; position_priority: number | null } | null;
      return {
        ...(data as RawAgent),
        position: pos?.position_title ?? null,
        position_id: pos?.position_id ?? null,
        position_priority: pos?.position_priority ?? null,
      } as Agent;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
