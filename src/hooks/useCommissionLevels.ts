import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type CommissionLevel = Tables<"commission_levels">;

export function useCommissionLevels() {
  return useQuery({
    queryKey: ["commissionLevels"],
    queryFn: async (): Promise<CommissionLevel[]> => {
      const { data, error } = await supabase
        .from("commission_levels")
        .select("*")
        .order("carrier")
        .order("product")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function lookupCommissionRate(
  levels: CommissionLevel[],
  carrier: string | null,
  position: string | null,
  applicationDate: string | null
): number | null {
  if (!carrier || !position || !applicationDate) return null;
  const match = levels.find(
    (l) =>
      l.carrier === carrier &&
      l.position === position &&
      l.start_date <= applicationDate
  );
  return match?.rate ?? null;
}
