import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/query-keys";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import type { Tables } from "@/integrations/supabase/types";

export type DraftPolicy = Tables<"policies">;

/**
 * Fetch the current agent's drafts. Drafts are private to the creator: an
 * agent's drafts never broadcast to their upline. The RLS policy on policies
 * enforces this server-side; the explicit `resolved_agent_id` filter here
 * makes the intent clear and avoids round-tripping rows the client can't read.
 */
export function useDrafts() {
  const { data: currentAgent } = useCurrentAgent();

  return useQuery({
    queryKey: [...QUERY_KEYS.drafts, currentAgent?.id],
    queryFn: async (): Promise<DraftPolicy[]> => {
      if (!currentAgent?.id) return [];
      const { data, error } = await supabase
        .from("policies")
        .select("*")
        .eq("status", "Draft")
        .eq("resolved_agent_id", currentAgent.id)
        .order("draft_saved_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DraftPolicy[];
    },
    enabled: !!currentAgent?.id,
    staleTime: 2 * 60 * 1000,
  });
}
