import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { GoalProgress } from "@/components/dashboard/GoalProgress";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { usePolicies, getPoliciesArray } from "@/hooks/usePolicies";
import { useCommissionPayouts } from "@/hooks/useCommissionPayouts";
import { useAgents } from "@/hooks/useAgents";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DollarSign, TrendingUp, FileText, Users, Upload, UserPlus, PlusCircle, ArrowRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
// Card imports removed — using card-elevated utility classes
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CSVImportModal } from "@/components/shared/CSVImportModal";
import { InviteAgentModal } from "@/components/agents/InviteAgentModal";
import { PostDealModal } from "@/components/policies/PostDealModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFilters } from "@/contexts/FilterContext";
import { useCarrierOptions } from "@/hooks/useCarrierOptions";
import { useCanImport } from "@/hooks/useCanImport";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, parseISO, formatDistanceToNow } from "date-fns";
import { useCanImport } from "@/hooks/useCanImport";

const Dashboard = () => {
  const { canImport } = useCanImport();
  const [importOpen, setImportOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [postDealOpen, setPostDealOpen] = useState(false);
  const [dashCarrier, setDashCarrier] = useState("");

  const { dateFrom, dateTo } = useFilters();

  const { data: currentAgent, isLoading: agentLoading } = useCurrentAgent();
  const { data: allPoliciesRaw, isLoading: policiesLoading } = usePolicies({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    carrier: dashCarrier && dashCarrier !== "all" ? dashCarrier : undefined,
  });
  const allPolicies = getPoliciesArray(allPoliciesRaw);
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: payouts, isLoading: payoutsLoading } = useCommissionPayouts({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    carrier: dashCarrier && dashCarrier !== "all" ? dashCarrier : undefined,
  });

  const { carriers: carrierList } = useCarrierOptions();
  const { canImport } = useCanImport();

  // Recent policies (last 5)
  const { data: recentPoliciesRaw } = usePolicies({ limit: 5 });
  const recentPolicies = getPoliciesArray(recentPoliciesRaw);

  // Commission trend: fetch payouts with policy application_date
  const trendCarrier = dashCarrier && dashCarrier !== "all" ? dashCarrier : undefined;
  const { data: trendPayouts } = useQuery({
    queryKey: ["commissionTrend", currentAgent?.id, trendCarrier],
    queryFn: async () => {
      if (!currentAgent) return [];
      let query = supabase
        .from("commission_payouts")
        .select(trendCarrier
          ? "commission_amount, policy_id, calculated_at, payout_type, policies!inner(application_date, carrier)"
          : "commission_amount, policy_id, calculated_at, payout_type, policies(application_date, carrier)"
        )
        .eq("agent_id", currentAgent.id)
        .eq("payout_type", "direct");
      if (trendCarrier) query = query.eq("policies.carrier", trendCarrier);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentAgent,
  });

  // Build 12-month trend data
  const trendData = useMemo(() => {
    const now = new Date();
    const months: { label: string; start: Date; end: Date }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(now, i);
      months.push({
        label: format(d, "MMM"),
        start: startOfMonth(d),
        end: endOfMonth(d),
      });
    }
    return months.map((m) => {
      const total = (trendPayouts ?? []).reduce((sum, p: any) => {
        const appDate = p.policies?.application_date;
        if (!appDate) return sum;
        const d = parseISO(appDate);
        if (d >= m.start && d <= m.end) {
          return sum + (p.commission_amount || 0);
        }
        return sum;
      }, 0);
      return { month: m.label, commission: total };
    });
  }, [trendPayouts]);

  const policyStatusMap = useMemo(() => new Map(allPolicies.map(p => [p.id, p.status])), [allPolicies]);

  // Cards: Premiums
  const subPremium = useMemo(() => allPolicies.filter(p => p.status === "Submitted").reduce((s, p) => s + (p.annual_premium || 0), 0), [allPolicies]);
  const actPremium = useMemo(() => allPolicies.filter(p => p.status === "Active").reduce((s, p) => s + (p.annual_premium || 0), 0), [allPolicies]);

  // Cards: Commissions
  const directPayouts = useMemo(() => payouts?.filter(p => p.payout_type === "direct" && p.agent_id === currentAgent?.id) ?? [], [payouts, currentAgent]);
  const subCommission = useMemo(() => directPayouts.filter(p => policyStatusMap.get(p.policy_id) === "Submitted").reduce((s, p) => s + (p.commission_amount || 0), 0), [directPayouts, policyStatusMap]);
  const actCommission = useMemo(() => directPayouts.filter(p => policyStatusMap.get(p.policy_id) === "Active").reduce((s, p) => s + (p.commission_amount || 0), 0), [directPayouts, policyStatusMap]);

  // Active Policies count
  const activePolicies = useMemo(() => allPolicies.filter((p) => p.status === "Active").length, [allPolicies]);
  
  // Backwards compatibility for GoalProgress (using Issued Commission)
  const totalCommission = actCommission;

  // Card 4: Team Size (exclude self)
  const teamSize = Math.max(0, (agents?.length ?? 0) - 1);

  // Top producers
  const topProducers = useMemo(() => {
    if (!agents || !payouts) return [];
    const map = new Map<string, number>();
    for (const p of payouts) {
      if (p.payout_type === "direct") {
        map.set(p.agent_id, (map.get(p.agent_id) || 0) + (p.commission_amount || 0));
      }
    }
    return agents
      .filter((a) => map.has(a.id))
      .map((a) => ({
        id: a.id,
        name: `${a.first_name} ${a.last_name}`,
        initials: `${(a.first_name || "")[0] || ""}${(a.last_name || "")[0] || ""}`.toUpperCase(),
        commission: map.get(a.id) || 0,
      }))
      .sort((a, b) => b.commission - a.commission)
      .slice(0, 5);
  }, [agents, payouts]);

  // Goal progress: direct commission vs annual_goal
  const annualGoal = Number(currentAgent?.annual_goal) || 0;

  // Last Import Summary
  const { data: importSummary, isLoading: importSummaryLoading } = useQuery({
    queryKey: ["lastImportSummary", currentAgent?.tenant_id],
    queryFn: async () => {
      const { data: maxDate } = await supabase.from("policies").select("created_at").order("created_at", { ascending: false }).limit(1);
      if (!maxDate?.length) return null;
      
      const lastDate = parseISO(maxDate[0].created_at);
      const startOfBatch = new Date(lastDate.getTime() - 90000).toISOString(); // 1.5 minute window for batch
      const { data: batch } = await supabase.from("policies").select("id, resolved_agent_id").gte("created_at", startOfBatch);
      if (!batch) return null;
      
      return {
        date: lastDate,
        total: batch.length,
        unassigned: batch.filter(p => !p.resolved_agent_id).length
      };
    },
    enabled: canImport && !!currentAgent
  });

  const loading = agentLoading || policiesLoading || payoutsLoading || agentsLoading;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back{currentAgent ? `, ${currentAgent.first_name}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPostDealOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" /> Post a Deal
            </Button>
            {canImport && (
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" /> Import
              </Button>
            )}
            <Button size="sm" className="btn-primary-elevated" onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" /> Invite Agent
            </Button>
          </div>
        </div>

        {/* Carrier filter */}
        <div className="card-elevated p-3 flex flex-wrap gap-3 items-center">
          <Select value={dashCarrier} onValueChange={setDashCarrier}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All Carriers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Carriers</SelectItem>
              {carrierList.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2 gap-4">
          <StatCard label="Submitted Premium" value={formatCurrency(subPremium)} icon={TrendingUp} loading={loading} animationDelay="0.05s" />
          <StatCard label="Active Premium" value={formatCurrency(actPremium)} icon={TrendingUp} loading={loading} animationDelay="0.10s" />
          <StatCard label="Active Policies" value={formatNumber(activePolicies)} icon={FileText} loading={loading} animationDelay="0.15s" />
          <StatCard label="Team Size" value={formatNumber(teamSize)} icon={Users} loading={loading} animationDelay="0.20s" />
          <StatCard label="Submitted Commission" value={formatCurrency(subCommission)} icon={DollarSign} loading={loading} animationDelay="0.25s" />
          <StatCard label="Issued Commission" value={formatCurrency(actCommission)} icon={DollarSign} variant="hero" loading={loading} animationDelay="0.30s" />
          <div className="lg:col-span-2">
            {canImport && importSummary && (
              <div className="card-elevated p-4 h-full flex flex-col justify-center animate-slide-up" style={{ animationDelay: "0.35s" }}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-foreground flex items-center">
                    <Upload className="h-4 w-4 mr-2 text-muted-foreground" />
                    Last Import Summary
                  </h3>
                  <a href="/book-of-business" className="text-xs text-primary hover:underline flex items-center">
                    View <ArrowRight className="h-3 w-3 ml-1" />
                  </a>
                </div>
                <div className="flex items-end justify-between">
                  <p className="text-xs text-muted-foreground">{formatDistanceToNow(importSummary.date)} ago</p>
                  <div className="flex gap-3 text-sm">
                    <span><span className="font-semibold">{importSummary.total}</span> imported</span>
                    {importSummary.unassigned > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {importSummary.unassigned} unassigned
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">All assigned</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <GoalProgress current={totalCommission} goal={annualGoal} loading={loading} />

        {/* Chart + Top Producers */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Commission Trend Chart */}
          <div className="card-elevated lg:col-span-2 animate-slide-up stagger-2">
            <div className="px-5 pt-5 pb-2">
              <h3 className="text-base font-semibold text-foreground">Commission Trend</h3>
            </div>
            <div className="px-5 pb-5">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      stroke="hsl(var(--muted-foreground))"
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), "Commission"]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--popover))",
                        color: "hsl(var(--popover-foreground))",
                        fontSize: 13,
                      }}
                      cursor={{ fill: "hsl(var(--accent))", opacity: 0.5 }}
                    />
                    <Bar
                      dataKey="commission"
                      fill="hsl(var(--primary))"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top Producers */}
          <div className="card-elevated animate-slide-up stagger-3">
            <div className="px-5 pt-5 pb-2">
              <h3 className="text-base font-semibold text-foreground">Top Producers</h3>
            </div>
            <div className="px-5 pb-5 space-y-3">
              {topProducers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No data yet</p>
              ) : (
                topProducers.map((producer, i) => (
                  <div key={producer.id} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-4">
                      {i + 1}
                    </span>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                      {producer.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{producer.name}</p>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {formatCurrency(producer.commission)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card-elevated overflow-hidden animate-slide-up stagger-4">
          <div className="px-5 pt-5 pb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">Recent Activity</h3>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" asChild>
              <a href="/book-of-business">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </a>
            </Button>
          </div>
          <div className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b-2 border-border bg-gradient-to-r from-muted/60 to-muted/30 hover:bg-transparent">
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-9">Client</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-9">Carrier</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-9 text-right">Premium</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-9">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPolicies.length > 0 ? (
                    recentPolicies.map((p) => (
                      <TableRow key={p.id} className="border-b border-border/50 table-row-hover">
                        <TableCell className="text-sm py-3">{p.client_name || "--"}</TableCell>
                        <TableCell className="text-sm py-3">{p.carrier || "--"}</TableCell>
                        <TableCell className="text-sm py-3 text-right font-medium">{formatCurrency(p.annual_premium)}</TableCell>
                        <TableCell className="py-3"><StatusBadge status={p.status} /></TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-12">
                        No policies yet. Import a CSV to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>

      <PostDealModal open={postDealOpen} onOpenChange={setPostDealOpen} />
      <CSVImportModal open={importOpen} onOpenChange={setImportOpen} />
      <InviteAgentModal open={inviteOpen} onOpenChange={setInviteOpen} />
    </AppLayout>
  );
};

export default Dashboard;
