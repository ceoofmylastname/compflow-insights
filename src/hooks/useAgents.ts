import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Agent = Tables<"agents">;

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: async (): Promise<Agent[]> => {
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .order("last_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDownlineAgents(currentAgentId?: string) {
  const query = useAgents();
  const downline = (query.data ?? []).filter((a) => a.id !== currentAgentId);
  return { ...query, data: downline };
}
