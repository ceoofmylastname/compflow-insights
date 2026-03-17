import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/query-keys";
import type { Tables } from "@/integrations/supabase/types";

export type DraftPolicy = Tables<"policies">;

export function useDrafts() {
  return useQuery({
    queryKey: [...QUERY_KEYS.drafts],
    queryFn: async (): Promise<DraftPolicy[]> => {
      const { data, error } = await supabase
        .from("policies")
        .select("*")
        .eq("is_draft", true)
        .order("draft_saved_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DraftPolicy[];
    },
  });
}
