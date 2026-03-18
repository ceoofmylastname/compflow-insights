import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";

export interface LapseAlert {
  id: string;
  clientName: string;
  carrier: string;
  daysPending: number;
  annualPremium: number;
  status: string;
  agentId: string | null;
}

export function useAlerts() {
  return useQuery({
    queryKey: ["lapseAlerts"],
    queryFn: async (): Promise<LapseAlert[]> => {
      const { data, error } = await supabase
        .from("policies")
        .select("id, client_name, carrier, application_date, annual_premium, status, resolved_agent_id")
        .eq("chargeback_risk", true)
        .in("status", ["Pending", "Submitted"]);

      if (error) throw error;

      const now = new Date();
      return (data ?? []).map((p) => ({
        id: p.id,
        clientName: p.client_name || "Unknown",
        carrier: p.carrier || "Unknown",
        daysPending: p.application_date
          ? differenceInDays(now, new Date(p.application_date))
          : 0,
        annualPremium: p.annual_premium || 0,
        status: p.status || "Unknown",
        agentId: p.resolved_agent_id,
      }));
    },
    refetchInterval: 5 * 60 * 1000,
  });
}
