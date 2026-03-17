import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { usePayrollRuns, useCreatePayrollRun, useUpdatePayrollRun, useDeletePayrollRun } from "@/hooks/usePayroll";
import { useCommissionPayouts } from "@/hooks/useCommissionPayouts";
import { useAgents } from "@/hooks/useAgents";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, DollarSign, Download, ChevronDown, ChevronRight } from "lucide-react";
import { downloadCSV, rowsToCSV } from "@/lib/csv-utils";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "secondary",
  processing: "default",
  completed: "default",
};

const Payroll = () => {
  const { data: currentAgent } = useCurrentAgent();
  const { data: payrollRuns, isLoading, error, refetch } = usePayrollRuns();
  const createRun = useCreatePayrollRun();
  const updateRun = useUpdatePayrollRun();
  const deleteRun = useDeletePayrollRun();
  const { data: agents } = useAgents();
  const isOwner = currentAgent?.is_owner ?? false;

  const [createOpen, setCreateOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const expandedRun = payrollRuns?.find((r) => r.id === expandedId);
  const { data: periodPayouts } = useCommissionPayouts(
    expandedRun
      ? { dateFrom: expandedRun.period_start, dateTo: expandedRun.period_end }
      : {}
  );

  const agentPayoutSummary = useMemo(() => {
    if (!periodPayouts || !agents) return [];
    const map = new Map<string, { name: string; total: number; policyCount: number }>();
    for (const p of periodPayouts) {
      const existing = map.get(p.agent_id) ?? {
        name: p.agent_name || "Unknown",
        total: 0,
        policyCount: 0,
      };
      existing.total += p.commission_amount || 0;
      existing.policyCount += 1;
      map.set(p.agent_id, existing);
    }
    return Array.from(map.entries())
      .map(([id, data]) => ({ agentId: id, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [periodPayouts, agents]);

  const handleCreate = () => {
    if (!periodStart || !periodEnd) return;
    const totalAmount = agentPayoutSummary.reduce((s, a) => s + a.total, 0);
    createRun.mutate(
      {
        period_start: periodStart,
        period_end: periodEnd,
        total_amount: totalAmount,
        agent_count: agentPayoutSummary.length,
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setPeriodStart("");
          setPeriodEnd("");
          setNotes("");
        },
      }
    );
  };

  const handleStatusChange = (id: string, newStatus: string) => {
    updateRun.mutate({
      id,
      status: newStatus,
      processed_at: newStatus === "completed" ? new Date().toISOString() : undefined,
    });
  };

  const handleExportPayroll = () => {
    if (!expandedRun || !periodPayouts) return;
    const headers = ["Agent", "Policy Count", "Commission Total"];
    const rows = agentPayoutSummary.map((a) => [
      a.name,
      String(a.policyCount),
      a.total.toFixed(2),
    ]);
    downloadCSV(
      `payroll-${expandedRun.period_start}-to-${expandedRun.period_end}.csv`,
      rowsToCSV(headers, rows)
    );
    toast.success("Payroll exported");
  };

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Payroll</h1>
          {isOwner && (
            <Button size="sm" className="btn-primary-elevated" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Payroll Run
            </Button>
          )}
        </div>

        {isLoading ? (
          <SkeletonTable columns={6} />
        ) : !payrollRuns || payrollRuns.length === 0 ? (
          <EmptyState
            title="No payroll runs"
            description="Create a payroll run to aggregate commission payouts by period."
            action={isOwner ? { label: "New Payroll Run", onClick: () => setCreateOpen(true) } : undefined}
            icon={<DollarSign className="h-10 w-10 text-muted-foreground" />}
          />
        ) : (
          <div className="space-y-2">
            {payrollRuns.map((run) => {
              const isExpanded = expandedId === run.id;
              return (
                <div key={run.id} className="card-elevated overflow-hidden">
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : run.id)}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-semibold text-foreground">
                        {formatDate(run.period_start)} — {formatDate(run.period_end)}
                      </span>
                      <Badge variant={STATUS_COLORS[run.status] as any ?? "secondary"}>
                        {run.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{run.agent_count} agents</span>
                      <span className="font-semibold text-foreground">{formatCurrency(Number(run.total_amount))}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                          {isOwner && (
                            <Select value={run.status} onValueChange={(v) => handleStatusChange(run.id, v)}>
                              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="draft">Draft</SelectItem>
                                <SelectItem value="processing">Processing</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={handleExportPayroll}>
                            <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
                          </Button>
                          {isOwner && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => {
                                if (confirm("Delete this payroll run?")) deleteRun.mutate(run.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                            </Button>
                          )}
                        </div>
                      </div>

                      {run.notes && (
                        <p className="text-sm text-muted-foreground">{run.notes}</p>
                      )}

                      {agentPayoutSummary.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No commission payouts found for this period.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Agent</TableHead>
                              <TableHead className="text-right">Policies</TableHead>
                              <TableHead className="text-right">Commission Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {agentPayoutSummary.map((a) => (
                              <TableRow key={a.agentId}>
                                <TableCell className="font-medium">{a.name}</TableCell>
                                <TableCell className="text-right">{a.policyCount}</TableCell>
                                <TableCell className="text-right font-semibold">{formatCurrency(a.total)}</TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="border-t-2 border-border font-bold">
                              <TableCell>Total</TableCell>
                              <TableCell className="text-right">
                                {agentPayoutSummary.reduce((s, a) => s + a.policyCount, 0)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(agentPayoutSummary.reduce((s, a) => s + a.total, 0))}
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Payroll Run</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Period Start</Label>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div>
                <Label>Period End</Label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
            </div>
            <Button className="w-full" onClick={handleCreate} disabled={createRun.isPending || !periodStart || !periodEnd}>
              {createRun.isPending ? "Creating..." : "Create Payroll Run"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Payroll;
