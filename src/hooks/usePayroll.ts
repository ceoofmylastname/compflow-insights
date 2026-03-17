import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { toast } from "sonner";
import { QUERY_KEYS } from "@/lib/query-keys";
import type { Tables } from "@/integrations/supabase/types";

export type PayrollRun = Tables<"payroll_runs">;

export function usePayrollRuns() {
  return useQuery({
    queryKey: [...QUERY_KEYS.payrollRuns],
    queryFn: async (): Promise<PayrollRun[]> => {
      const { data, error } = await supabase
        .from("payroll_runs")
        .select("*")
        .order("period_start", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PayrollRun[];
    },
  });
}

export function useCreatePayrollRun() {
  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();

  return useMutation({
    mutationFn: async (params: {
      period_start: string;
      period_end: string;
      status?: string;
      total_amount?: number;
      agent_count?: number;
      notes?: string;
    }) => {
      if (!currentAgent) throw new Error("Not authenticated");
      const { error } = await supabase.from("payroll_runs").insert({
        tenant_id: currentAgent.tenant_id,
        period_start: params.period_start,
        period_end: params.period_end,
        status: params.status ?? "draft",
        total_amount: params.total_amount ?? 0,
        agent_count: params.agent_count ?? 0,
        processed_by: currentAgent.id,
        notes: params.notes || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.payrollRuns] });
      toast.success("Payroll run created");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdatePayrollRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      status?: string;
      total_amount?: number;
      agent_count?: number;
      processed_at?: string;
      notes?: string;
    }) => {
      const { id, ...updates } = params;
      const { error } = await supabase.from("payroll_runs").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.payrollRuns] });
      toast.success("Payroll run updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeletePayrollRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payroll_runs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.payrollRuns] });
      toast.success("Payroll run deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
