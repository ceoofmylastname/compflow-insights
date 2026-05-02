import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { useBulkDeletePolicies } from "@/hooks/useBulkDeletePolicies";

/**
 * Owner confirmation modal for the BoB bulk delete.
 *
 * Three guardrails on the way to actually firing the RPC:
 *   1. Type-to-confirm: owner must type the exact selected count.
 *   2. Big visual surface for the totals about to disappear (premium
 *      and paid commission). Paid commission renders red with a hard
 *      warning when nonzero — chargebacks become irrecoverable once
 *      the rows are gone.
 *   3. Optional reason textarea. The reason lands in
 *      policy_deletions_audit.reason for the forensic trail.
 */
export interface BulkDeleteSummary {
  policyIds: string[];
  totalPremium: number;
  totalPaidCommission: number;
  /** Source of the selection — used to label the modal heading. */
  scope: "page" | "filter";
}

export function BulkDeletePoliciesModal({
  open,
  onOpenChange,
  summary,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  summary: BulkDeleteSummary | null;
  onDeleted?: () => void;
}) {
  const bulkDelete = useBulkDeletePolicies();
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");

  // Reset the form whenever the modal closes so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setConfirmText("");
      setReason("");
    }
  }, [open]);

  if (!summary) return null;

  const count = summary.policyIds.length;
  const target = String(count);
  const confirmMatches = confirmText.trim() === target;
  const hasPaidCommission = summary.totalPaidCommission > 0;

  const handleDelete = async () => {
    if (!confirmMatches || count === 0) return;
    await bulkDelete.mutateAsync({
      policyIds: summary.policyIds,
      reason: reason.trim() || undefined,
    });
    onOpenChange(false);
    onDeleted?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete {count} {count === 1 ? "policy" : "policies"}?
          </DialogTitle>
          <DialogDescription>
            {summary.scope === "filter"
              ? "Deleting every policy that matches the current filter. This cannot be undone."
              : "Deleting the selected rows on this page. This cannot be undone."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border border-border p-3 space-y-1.5 bg-muted/40">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total annual premium</span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(summary.totalPremium)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Paid commission already disbursed</span>
              <span
                className={`font-semibold tabular-nums ${
                  hasPaidCommission ? "text-destructive" : "text-foreground"
                }`}
              >
                {formatCurrency(summary.totalPaidCommission)}
              </span>
            </div>
          </div>

          {hasPaidCommission && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm font-semibold text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Chargeback warning
              </p>
              <p className="text-xs text-destructive/90 mt-1">
                {formatCurrency(summary.totalPaidCommission)} in paid commission rows will be removed
                alongside these policies. If any of these policies later charge back, the platform
                cannot reverse a payout that no longer exists. Re-import or re-create the policies
                before any chargeback hits if you may need that history.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="bulk-delete-reason" className="text-xs">
              Reason (optional, recorded in the audit log)
            </Label>
            <Textarea
              id="bulk-delete-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Bad CSV import on 2026-05-02; re-uploading clean file."
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="bulk-delete-confirm" className="text-xs">
              Type <span className="font-mono font-semibold text-foreground">{target}</span> to
              confirm
            </Label>
            <Input
              id="bulk-delete-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={target}
              className="mt-1 font-mono"
              autoFocus
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={bulkDelete.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!confirmMatches || bulkDelete.isPending}
          >
            {bulkDelete.isPending
              ? "Deleting..."
              : `Delete ${count} ${count === 1 ? "policy" : "policies"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
