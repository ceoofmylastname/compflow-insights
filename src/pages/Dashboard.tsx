import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { GoalProgress } from "@/components/dashboard/GoalProgress";
import { RecentPolicies } from "@/components/dashboard/RecentPolicies";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { usePolicies } from "@/hooks/usePolicies";
import { useCommissionPayouts } from "@/hooks/useCommissionPayouts";
import { useAgents } from "@/hooks/useAgents";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { DollarSign, TrendingUp, FileText, Users, Upload, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CSVImportModal } from "@/components/shared/CSVImportModal";
import { InviteAgentModal } from "@/components/agents/InviteAgentModal";

const Dashboard = () => {
  const [importOpen, setImportOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: currentAgent, isLoading: agentLoading } = useCurrentAgent();
  const { data: allPolicies, isLoading: policiesLoading } = usePolicies({});
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: payouts, isLoading: payoutsLoading } = useCommissionPayouts({});

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
          <StatCard
            title="Total Commission"
            value={formatCurrency(totalCommission)}
            icon={DollarSign}
            loading={loading}
          />
          <StatCard
            title="Team Premium"
            value={formatCurrency(teamPremium)}
            icon={TrendingUp}
            loading={loading}
          />
          <StatCard
            title="Active Policies"
            value={formatNumber(activePolicies)}
            icon={FileText}
            loading={loading}
          />
          <StatCard
            title="Team Size"
            value={formatNumber(teamSize)}
            icon={Users}
            loading={loading}
          />
        </div>

        <GoalProgress
          current={totalCommission}
          goal={annualGoal}
          loading={loading}
        />

        <RecentPolicies />
      </div>

      <CSVImportModal open={importOpen} onOpenChange={setImportOpen} />
      <InviteAgentModal open={inviteOpen} onOpenChange={setInviteOpen} />
    </AppLayout>
  );
};

export default Dashboard;
