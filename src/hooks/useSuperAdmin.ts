import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function useSuperAdmin() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["superAdmin", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_admins" as any)
        .select("id")
        .eq("auth_user_id", user!.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });

  return { isSuperAdmin: data ?? false, isLoading };
}
