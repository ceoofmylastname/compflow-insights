import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Tables } from "@/integrations/supabase/types";

export type Agent = Tables<"agents">;

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
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
