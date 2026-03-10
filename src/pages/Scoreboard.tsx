import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { EmptyState } from "@/components/shared/EmptyState";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useAgents } from "@/hooks/useAgents";
import { usePolicies } from "@/hooks/usePolicies";
import { useCommissionPayouts } from "@/hooks/useCommissionPayouts";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type TimeRange = "month" | "quarter" | "ytd" | "custom";

function getDateRange(range: TimeRange, customFrom?: string, customTo?: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (range) {
    case "month":
      return { from: `${y}-${String(m + 1).padStart(2, "0")}-01`, to: undefined };
    case "quarter": {
      const qStart = Math.floor(m / 3) * 3;
      return { from: `${y}-${String(qStart + 1).padStart(2, "0")}-01`, to: undefined };
    }
    case "ytd":
      return { from: `${y}-01-01`, to: undefined };
    case "custom":
      return { from: customFrom, to: customTo };
  }
}

interface ScoreRow {
  agentId: string;
  name: string;
  position: string;
  activePolicies: number;
  totalPremium: number;
  commissionEarned: number;
  goalProgress: number;
  annualGoal: number;
}

const Scoreboard = () => {
  const [range, setRange] = useState<TimeRange>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { data: currentAgent } = useCurrentAgent();
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const dateRange = getDateRange(range, customFrom, customTo);

  const { data: policies, isLoading: policiesLoading, error, refetch } = usePolicies({
    status: ["Active"],
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
  });
  const { data: payouts, isLoading: payoutsLoading } = useCommissionPayouts({
    dateFrom: dateRange.from ? `${dateRange.from}T00:00:00Z` : undefined,
    dateTo: dateRange.to ? `${dateRange.to}T23:59:59Z` : undefined,
  });

  const scoreData = useMemo((): ScoreRow[] => {
    if (!agents || !policies || !payouts) return [];
    return agents.map((agent) => {
      const agentPolicies = policies.filter((p) => p.resolved_agent_id === agent.id);
      const agentPayouts = payouts.filter((p) => p.agent_id === agent.id);
      const totalPrem = agentPolicies.reduce((s, p) => s + (p.annual_premium || 0), 0);
      const totalComm = agentPayouts.reduce((s, p) => s + (p.commission_amount || 0), 0);
      const goal = Number(agent.annual_goal) || 0;
      return {
        agentId: agent.id,
        name: `${agent.first_name} ${agent.last_name}`,
        position: agent.position || "--",
        activePolicies: agentPolicies.length,
        totalPremium: totalPrem,
        commissionEarned: totalComm,
        goalProgress: goal > 0 ? (totalComm / goal) * 100 : 0,
        annualGoal: goal,
      };
    }).sort((a, b) => b.totalPremium - a.totalPremium);
  }, [agents, policies, payouts]);

  const rankedData = scoreData.map((row, i) => ({ ...row, rank: i + 1 }));
  const currentRow = rankedData.find((r) => r.agentId === currentAgent?.id);

  const loading = agentsLoading || policiesLoading || payoutsLoading;

  const columns: Column<typeof rankedData[number]>[] = [
    { key: "rank", label: "Rank", render: (r) => <span className="font-bold">#{r.rank}</span> },
    { key: "name", label: "Agent Name" },
    { key: "position", label: "Position" },
    { key: "activePolicies", label: "Active Policies", getValue: (r) => r.activePolicies },
    { key: "totalPremium", label: "Total Active Annual Premium", render: (r) => formatCurrency(r.totalPremium), getValue: (r) => r.totalPremium },
    { key: "commissionEarned", label: "Commission Earned", render: (r) => formatCurrency(r.commissionEarned), getValue: (r) => r.commissionEarned },
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

  const getRowClass = (row: typeof rankedData[number]) => {
    if (row.agentId === currentAgent?.id) return "bg-primary/5 border-l-2 border-l-primary";
    if (row.rank === 1) return "border-l-2 border-l-[#FFD700]";
    if (row.rank === 2) return "border-l-2 border-l-[#C0C0C0]";
    if (row.rank === 3) return "border-l-2 border-l-[#CD7F32]";
    return "";
  };

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Scoreboard</h1>
          <div className="flex gap-2 items-center">
            <Tabs value={range} onValueChange={(v) => setRange(v as TimeRange)}>
              <TabsList>
                <TabsTrigger value="month">This Month</TabsTrigger>
                <TabsTrigger value="quarter">This Quarter</TabsTrigger>
                <TabsTrigger value="ytd">YTD</TabsTrigger>
                <TabsTrigger value="custom">Custom</TabsTrigger>
              </TabsList>
            </Tabs>
            {range === "custom" && (
              <div className="flex gap-2">
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-36" />
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-36" />
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <SkeletonTable columns={7} />
        ) : rankedData.length === 0 ? (
          <EmptyState title="No scoreboard data" description="Import policies to see agent rankings." />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={rankedData}
              pageSize={25}
              rowClassName={getRowClass}
            />
            {currentRow && currentRow.rank > 25 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-sm text-foreground">
                  Your rank: <span className="font-bold">#{currentRow.rank}</span> —{" "}
                  {formatCurrency(currentRow.totalPremium)} premium,{" "}
                  {formatCurrency(currentRow.commissionEarned)} commission
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
