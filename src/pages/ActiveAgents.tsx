import { useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useAgents, Agent } from "@/hooks/useAgents";
import { usePolicies, getPoliciesArray } from "@/hooks/usePolicies";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { subDays, format } from "date-fns";

const ActiveAgents = () => {
  const { data: agents, isLoading: agentsLoading, error } = useAgents();
  const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const { data: recentPoliciesRaw, isLoading: policiesLoading } = usePolicies({
    dateFrom: thirtyDaysAgo,
  });
  const recentPolicies = getPoliciesArray(recentPoliciesRaw);

  const isLoading = agentsLoading || policiesLoading;

  const activeAgents = useMemo(() => {
    if (!agents || !recentPolicies) return [];
    const agentIdsWithPolicies = new Set(
      recentPolicies.map((p) => p.resolved_agent_id).filter(Boolean)
    );
    return agents.filter((a) => agentIdsWithPolicies.has(a.id));
  }, [agents, recentPolicies]);

  const getAgentStats = (agentId: string) => {
    const agentPolicies = recentPolicies.filter((p) => p.resolved_agent_id === agentId);
    const totalPremium = agentPolicies.reduce((s, p) => s + (p.annual_premium || 0), 0);
    return { policyCount: agentPolicies.length, totalPremium };
  };

  const columns: Column<Agent>[] = [
    { key: "name", label: "Full Name", render: (r) => `${r.first_name} ${r.last_name}` },
    { key: "email", label: "Email" },
    { key: "position", label: "Position" },
    { key: "contract_type", label: "Contract Type" },
    {
      key: "policies_30d",
      label: "Policies (30d)",
      render: (r) => {
        const stats = getAgentStats(r.id);
        return String(stats.policyCount);
      },
      getValue: (r) => getAgentStats(r.id).policyCount,
    },
    {
      key: "premium_30d",
      label: "Premium (30d)",
      render: (r) => formatCurrency(getAgentStats(r.id).totalPremium),
      getValue: (r) => getAgentStats(r.id).totalPremium,
    },
    { key: "start_date", label: "Start Date", render: (r) => formatDate(r.start_date) },
  ];

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Active Agents</h1>
          <p className="text-sm text-muted-foreground">
            Agents with at least one policy in the last 30 days
          </p>
        </div>

        {isLoading ? (
          <SkeletonTable columns={7} />
        ) : activeAgents.length === 0 ? (
          <EmptyState
            title="No active agents"
            description="No agents have posted policies in the last 30 days."
          />
        ) : (
          <DataTable columns={columns} data={activeAgents} pageSize={25} />
        )}
      </div>
    </AppLayout>
  );
};

export default ActiveAgents;
