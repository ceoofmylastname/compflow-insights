/**
 * Owner bulk delete on the Book of Business per
 * Wiki/book-of-business-page.md and Wiki/hierarchy-permissions-model.md.
 *
 * Calls the bulk_delete_policies RPC (security-definer, owner-checked,
 * cross-tenant-guarded) and on success:
 *   1. Fires a policy.deleted webhook per deleted policy.
 *   2. Invalidates every query — this is a rare, destructive owner
 *      action, so a full TanStack invalidation is correct and keeps
 *      every aggregation (dashboard buckets, leaderboards, payroll,
 *      scoreboard, agent profile, recent activity feed) live without a
 *      manual refresh.
 *
 * The Realtime cascade for `policy.deleted` rides on Supabase's
 * Postgres replication: any subscriber to the policies table on this
 * tenant receives the DELETE row event automatically. Subscribers
 * recompute their views off that signal.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useAgents } from "@/hooks/useAgents";
import { toast } from "sonner";

export interface BulkDeleteResultRow {
  deleted_policy_id: string;
  agent_id: string | null;
  status_at_deletion: string | null;
  annual_premium_at_deletion: number | null;
  paid_commission_total: number | null;
  audit_id: string;
}

export interface BulkDeleteResult {
  rows: BulkDeleteResultRow[];
  totalPremium: number;
  totalPaidCommission: number;
}

export function useBulkDeletePolicies() {
  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();
  const { data: agents } = useAgents();

  return useMutation({
    mutationFn: async (params: {
      policyIds: string[];
      reason?: string;
    }): Promise<BulkDeleteResult> => {
      if (!currentAgent) throw new Error("Not authenticated");
      if (params.policyIds.length === 0) {
        return { rows: [], totalPremium: 0, totalPaidCommission: 0 };
      }

      const { data, error } = await supabase.rpc("bulk_delete_policies" as any, {
        policy_ids: params.policyIds,
        reason: params.reason ?? null,
      });
      if (error) throw error;

      const rows = ((data ?? []) as unknown as BulkDeleteResultRow[]) ?? [];
      const totalPremium = rows.reduce((s, r) => s + (Number(r.annual_premium_at_deletion) || 0), 0);
      const totalPaidCommission = rows.reduce((s, r) => s + (Number(r.paid_commission_total) || 0), 0);

      // Fire policy.deleted webhooks per deleted row. Best-effort: a
      // webhook delivery failure should not roll back the delete (the
      // delete already committed). Errors are swallowed and logged the
      // same way other event emitters in this codebase handle them.
      try {
        const { data: hooks } = await supabase
          .from("webhook_configs")
          .select("webhook_url")
          .eq("tenant_id", currentAgent.tenant_id)
          .eq("is_active", true)
          .eq("event_type", "policy.deleted" as any);

        if (hooks && hooks.length > 0) {
          for (const row of rows) {
            const agent = agents?.find((a) => a.id === row.agent_id);
            const payload = {
              event: "policy.deleted",
              policy_id: row.deleted_policy_id,
              agent_id: row.agent_id,
              agent_email: agent?.email || "",
              deleted_by_user_id: currentAgent.id,
              status_at_deletion: row.status_at_deletion,
              annual_premium_at_deletion: row.annual_premium_at_deletion,
            };
            for (const config of hooks as Array<{ webhook_url: string }>) {
              await supabase.functions.invoke("fire-webhook", {
                body: { webhook_url: config.webhook_url, payload },
              });
            }
          }
        }
      } catch (e) {
        console.error("Failed to fire policy.deleted webhooks", e);
      }

      return { rows, totalPremium, totalPaidCommission };
    },
    onSuccess: (result) => {
      // Full invalidation per the spec. Rare destructive owner action;
      // every aggregation needs to recompute.
      queryClient.invalidateQueries();
      const n = result.rows.length;
      if (n > 0) {
        toast.success(`Deleted ${n} ${n === 1 ? "policy" : "policies"}`);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Bulk delete failed");
    },
  });
}
