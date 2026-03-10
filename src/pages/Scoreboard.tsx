import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { EmptyState } from "@/components/shared/EmptyState";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useAgents } from "@/hooks/useAgents";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { downloadCSV, rowsToCSV } from "@/lib/csv-utils";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";

interface PayoutWithPolicy {
  id: string;
  agent_id: string;
  policy_id: string;
  commission_amount: number | null;
  commission_rate: number | null;
  payout_type: string;
  policies: {
    application_date: string | null;
    carrier: string | null;
    status: string | null;
    annual_premium: number | null;
  } | null;
}

function usePayoutsWithPolicies() {
  return useQuery({
    queryKey: ["payoutsWithPolicies"],
    queryFn: async (): Promise<PayoutWithPolicy[]> => {
      const { data, error } = await supabase
        .from("commission_payouts")
        .select("id, agent_id, policy_id, commission_amount, commission_rate, payout_type, policies(application_date, carrier, status, annual_premium)");
      if (error) throw error;
      return (data ?? []) as unknown as PayoutWithPolicy[];
    },
  });
}

interface ScoreRow {
  agentId: string;
  name: string;
  position: string;
  policies: number;
  totalPremium: number;
  totalCommission: number;
  goalProgress: number;
  annualGoal: number;
}

const STATUSES = ["Active", "Submitted", "Pending", "Terminated"];

const Scoreboard = () => {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [carrier, setCarrier] = useState("");
  const [status, setStatus] = useState("");

  const { data: currentAgent } = useCurrentAgent();
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: payouts, isLoading: payoutsLoading, error, refetch } = usePayoutsWithPolicies();

  // Derive available carriers from data
  const carriers = useMemo(() => {
    if (!payouts) return [];
    const set = new Set<string>();
    payouts.forEach((p) => { if (p.policies?.carrier) set.add(p.policies.carrier); });
    return [...set].sort();
  }, [payouts]);

  // Filter and aggregate
  const scoreData = useMemo((): ScoreRow[] => {
    if (!agents || !payouts) return [];

    // Filter payouts by policy fields
    const filtered = payouts.filter((p) => {
      const pol = p.policies;
      if (!pol) return false;
      if (dateFrom && pol.application_date && pol.application_date < dateFrom) return false;
      if (dateTo && pol.application_date && pol.application_date > dateTo) return false;
      if (carrier && pol.carrier !== carrier) return false;
      if (status && pol.status !== status) return false;
      return true;
    });

    // Group by agent
    const map = new Map<string, { commission: number; premium: number; policyIds: Set<string> }>();
    for (const p of filtered) {
      const existing = map.get(p.agent_id) || { commission: 0, premium: 0, policyIds: new Set<string>() };
      existing.commission += p.commission_amount || 0;
      if (!existing.policyIds.has(p.policy_id)) {
        existing.premium += p.policies?.annual_premium || 0;
        existing.policyIds.add(p.policy_id);
      }
      map.set(p.agent_id, existing);
    }

    return agents
      .filter((a) => map.has(a.id))
      .map((agent) => {
        const agg = map.get(agent.id)!;
        const goal = Number(agent.annual_goal) || 0;
        return {
          agentId: agent.id,
          name: `${agent.first_name} ${agent.last_name}`,
          position: agent.position || "--",
          policies: agg.policyIds.size,
          totalPremium: agg.premium,
          totalCommission: agg.commission,
          goalProgress: goal > 0 ? (agg.commission / goal) * 100 : 0,
          annualGoal: goal,
        };
      })
      .sort((a, b) => b.totalCommission - a.totalCommission);
  }, [agents, payouts, dateFrom, dateTo, carrier, status]);

  const rankedData = scoreData.map((row, i) => ({ ...row, rank: i + 1 }));
  const currentRow = rankedData.find((r) => r.agentId === currentAgent?.id);
  const loading = agentsLoading || payoutsLoading;

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
          <h1 className="text-2xl font-bold text-foreground">Scoreboard</h1>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={rankedData.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" placeholder="From" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" placeholder="To" />
          <Select value={carrier} onValueChange={(v) => setCarrier(v === "all" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Carriers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Carriers</SelectItem>
              {carriers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
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
