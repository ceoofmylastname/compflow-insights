import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { GoalProgress } from "@/components/dashboard/GoalProgress";
import { RecentPolicies } from "@/components/dashboard/RecentPolicies";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { usePolicies } from "@/hooks/usePolicies";
import { useCommissionPayouts } from "@/hooks/useCommissionPayouts";
import { useAgents } from "@/hooks/useAgents";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, TrendingUp, FileText, Users, Upload, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CSVImportModal } from "@/components/shared/CSVImportModal";
import { InviteAgentModal } from "@/components/agents/InviteAgentModal";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from "date-fns";

const Dashboard = () => {
  const [importOpen, setImportOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: currentAgent, isLoading: agentLoading } = useCurrentAgent();
  const { data: allPolicies, isLoading: policiesLoading } = usePolicies({});
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: payouts, isLoading: payoutsLoading } = useCommissionPayouts({});

  // Commission trend: fetch payouts with policy application_date
  const { data: trendPayouts } = useQuery({
    queryKey: ["commissionTrend", currentAgent?.id],
    queryFn: async () => {
      if (!currentAgent) return [];
      const { data, error } = await supabase
        .from("commission_payouts")
        .select("commission_amount, policy_id, calculated_at, payout_type, policies(application_date)")
        .eq("agent_id", currentAgent.id)
        .eq("payout_type", "direct");
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

  // Card 1: Total Commission (direct payouts for current agent)
  const totalCommission = useMemo(() => {
    if (!payouts || !currentAgent) return 0;
    return payouts
      .filter((p) => p.payout_type === "direct" && p.agent_id === currentAgent.id)
      .reduce((s, p) => s + (p.commission_amount || 0), 0);
  }, [payouts, currentAgent]);

  // Card 2: Team Premium (all policies in scope — RLS scopes to downline)
  const teamPremium = useMemo(
    () => (allPolicies ?? []).reduce((s, p) => s + (p.annual_premium || 0), 0),
    [allPolicies]
  );

  // Card 3: Active Policies count
  const activePolicies = useMemo(
    () => (allPolicies ?? []).filter((p) => p.status === "Active").length,
    [allPolicies]
  );

  // Card 4: Team Size (exclude self)
  const teamSize = Math.max(0, (agents?.length ?? 0) - 1);

  // Goal progress: direct commission vs annual_goal
  const annualGoal = Number(currentAgent?.annual_goal) || 0;

  const loading = agentLoading || policiesLoading || payoutsLoading || agentsLoading;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back{currentAgent ? `, ${currentAgent.first_name}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Import CSV
            </Button>
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" /> Invite Agent
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Commission" value={formatCurrency(totalCommission)} icon={DollarSign} loading={loading} />
          <StatCard title="Team Premium" value={formatCurrency(teamPremium)} icon={TrendingUp} loading={loading} />
          <StatCard title="Active Policies" value={formatNumber(activePolicies)} icon={FileText} loading={loading} />
          <StatCard title="Team Size" value={formatNumber(teamSize)} icon={Users} loading={loading} />
        </div>

        <GoalProgress current={totalCommission} goal={annualGoal} loading={loading} />

        {/* Commission Trend Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Commission Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), "Commission"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="commission"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "hsl(var(--primary))" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <RecentPolicies />
      </div>

      <CSVImportModal open={importOpen} onOpenChange={setImportOpen} />
      <InviteAgentModal open={inviteOpen} onOpenChange={setInviteOpen} />
    </AppLayout>
  );
};

export default Dashboard;
