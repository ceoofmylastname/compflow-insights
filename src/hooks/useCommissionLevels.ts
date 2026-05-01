import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type RawCommissionLevel = Tables<"commission_levels">;

/**
 * CommissionLevel as used in the app. The `position` TEXT field is INJECTED
 * from the joined `positions` row (via position_id FK). This lets every
 * consumer keep reading `level.position` after the legacy TEXT column drops.
 */
export interface CommissionLevel extends Omit<RawCommissionLevel, "position"> {
  position: string;
  position_id: string;
}

export function useCommissionLevels() {
  return useQuery({
    queryKey: ["commissionLevels"],
    queryFn: async (): Promise<CommissionLevel[]> => {
      const { data, error } = await supabase
        .from("commission_levels")
        .select("*, positions:position_id (id, title, priority)")
        .order("carrier")
        .order("product")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        ...(row as RawCommissionLevel),
        position: row.positions?.title ?? "",
        position_id: (row as any).position_id ?? row.positions?.id ?? "",
      })) as CommissionLevel[];
    },
  });
}

/**
 * Find the rate for a given carrier/product/position_id active on appDate.
 * Levels must be sorted by start_date DESC. Returns null when no level applies.
 *
 * positionId is a UUID FK to public.positions.id.
 */
export function lookupCommissionRate(
  levels: CommissionLevel[],
  carrier: string | null,
  positionId: string | null,
  applicationDate: string | null
): number | null {
  if (!carrier || !positionId || !applicationDate) return null;
  const match = levels.find(
    (l) =>
      l.carrier === carrier &&
      l.position_id === positionId &&
      l.start_date <= applicationDate
  );
  return match?.rate ?? null;
}
