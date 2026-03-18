import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { EmptyState } from "@/components/shared/EmptyState";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useScoreboardData } from "@/hooks/useScoreboardData";
import { formatCurrency } from "@/lib/formatters";
import { downloadCSV, rowsToCSV } from "@/lib/csv-utils";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";
import { useFilters } from "@/contexts/FilterContext";
import { useCarrierOptions } from "@/hooks/useCarrierOptions";

const STATUSES = ["Active", "Submitted", "Pending", "Terminated"];

const Scoreboard = () => {
  const { dateFrom, dateTo } = useFilters();
  const [carrier, setCarrier] = useState("");
  const [status, setStatus] = useState("");
  const [leadSource, setLeadSource] = useState("");

  const { data: currentAgent } = useCurrentAgent();
  const { carriers } = useCarrierOptions();

  const { scoreData, leadSources, isLoading, error, refetch } = useScoreboardData({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    carrier: carrier || undefined,
    status: status || undefined,
    leadSource: leadSource || undefined,
  });

  const rankedData = scoreData.map((row, i) => ({ ...row, rank: i + 1 }));
  const currentRow = rankedData.find((r) => r.agentId === currentAgent?.id);

  const columns: Column<(typeof rankedData)[number]>[] = [
    { key: "rank", label: "Rank", render: (r) => <span className="font-bold">#{r.rank}</span> },
    { key: "name", label: "Agent Name" },
    { key: "position", label: "Position" },
    { key: "policies", label: "Policies", getValue: (r) => r.policies },
    { key: "totalPremium", label: "Total Annual Premium", render: (r) => formatCurrency(r.totalPremium), getValue: (r) => r.totalPremium },
    { key: "totalCommission", label: "Total Commission", render: (r) => formatCurrency(r.totalCommission), getValue: (r) => r.totalCommission },
    {
      key: "goalProgress",
      label: "Goal Progress",
      render: (r) => (
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress value={Math.min(100, r.goalProgress)} className="h-2 flex-1" />
          <span className="text-xs text-muted-foreground">{r.goalProgress.toFixed(0)}%</span>
        </div>
      ),
    },
  ];

  const getRowClass = (row: (typeof rankedData)[number]) => {
    if (row.agentId === currentAgent?.id) return "bg-primary/5 border-l-2 border-l-primary";
    if (row.rank === 1) return "border-l-2 border-l-[hsl(48,100%,50%)]";
    if (row.rank === 2) return "border-l-2 border-l-[hsl(0,0%,75%)]";
    if (row.rank === 3) return "border-l-2 border-l-[hsl(25,57%,50%)]";
    return "";
  };

  const handleExport = () => {
    const headers = ["Rank", "Agent Name", "Position", "Policies", "Total Annual Premium", "Total Commission", "Goal Progress %"];
    const rows = rankedData.map((r) => [
      String(r.rank), r.name, r.position, String(r.policies),
      r.totalPremium.toFixed(2), r.totalCommission.toFixed(2), r.goalProgress.toFixed(1),
    ]);
    downloadCSV("scoreboard.csv", rowsToCSV(headers, rows));
  };

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Scoreboard</h1>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={rankedData.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>

        <div className="card-elevated p-3 flex flex-wrap gap-3 items-center">
          <Select value={carrier} onValueChange={(v) => setCarrier(v === "all" ? "" : v)}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All Carriers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Carriers</SelectItem>
              {carriers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {leadSources.length > 0 && (
            <Select value={leadSource} onValueChange={(v) => setLeadSource(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All Sources" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {leadSources.map((ls) => <SelectItem key={ls} value={ls}>{ls}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {isLoading ? (
          <SkeletonTable columns={7} />
        ) : rankedData.length === 0 ? (
          <EmptyState title="No scoreboard data" description="Import policies and calculate commissions to see agent rankings." />
        ) : (
          <>
            <DataTable columns={columns} data={rankedData} pageSize={25} rowClassName={getRowClass} />
            {currentRow && currentRow.rank > 25 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-sm text-foreground">
                  Your rank: <span className="font-bold">#{currentRow.rank}</span> —{" "}
                  {formatCurrency(currentRow.totalPremium)} premium,{" "}
                  {formatCurrency(currentRow.totalCommission)} commission
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default Scoreboard;
