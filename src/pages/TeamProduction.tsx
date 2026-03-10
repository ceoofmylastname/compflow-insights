import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { usePolicies, Policy } from "@/hooks/usePolicies";
import { useAgents } from "@/hooks/useAgents";
import { useCommissionLevels, lookupCommissionRate } from "@/hooks/useCommissionLevels";
import { formatCurrency, formatPercent, formatDate } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TeamProduction = () => {
  const { data: currentAgent } = useCurrentAgent();
  const { data: agents } = useAgents();
  const { data: levels } = useCommissionLevels();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [carrier, setCarrier] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [view, setView] = useState<"individual" | "grouped">("individual");

  // Get all policies (RLS scoped to downline + self), then exclude self
  const { data: allPolicies, isLoading, error, refetch } = usePolicies({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    carrier: carrier || undefined,
  });

  const downlinePolicies = useMemo(() => {
    if (!allPolicies || !currentAgent) return [];
    return allPolicies.filter((p) => p.resolved_agent_id !== currentAgent.id);
  }, [allPolicies, currentAgent]);

  const filteredPolicies = useMemo(() => {
    if (!agentFilter) return downlinePolicies;
    return downlinePolicies.filter((p) => p.resolved_agent_id === agentFilter);
  }, [downlinePolicies, agentFilter]);

  const downlineAgents = useMemo(() => {
    if (!agents || !currentAgent) return [];
    return agents.filter((a) => a.id !== currentAgent.id);
  }, [agents, currentAgent]);

  const getAgentName = (id: string | null) => {
    const a = agents?.find((x) => x.id === id);
    return a ? `${a.first_name} ${a.last_name}` : "--";
  };

  const getAgentPosition = (id: string | null) => {
    return agents?.find((x) => x.id === id)?.position || null;
  };

  const enriched = useMemo(() => {
    if (!filteredPolicies || !levels) return [];
    return filteredPolicies.map((p) => {
      const agentPos = getAgentPosition(p.resolved_agent_id);
      const rate = lookupCommissionRate(levels, p.carrier, agentPos, p.application_date);
      return {
        ...p,
        _agentName: getAgentName(p.resolved_agent_id),
        _rate: rate,
        _commission: rate != null && p.annual_premium ? p.annual_premium * rate : null,
      };
    });
  }, [filteredPolicies, levels, agents]);

  const totalPremium = enriched.reduce((s, p) => s + (p.annual_premium || 0), 0);
  const totalCommission = enriched.reduce((s, p) => s + (p._commission || 0), 0);

  const columns: Column<typeof enriched[number]>[] = [
    { key: "_agentName", label: "Writing Agent" },
    { key: "policy_number", label: "Policy Number" },
    { key: "client_name", label: "Client Name" },
    { key: "carrier", label: "Carrier" },
    { key: "product", label: "Product" },
    { key: "application_date", label: "Application Date", render: (r) => formatDate(r.application_date) },
    { key: "annual_premium", label: "Annual Premium", render: (r) => formatCurrency(r.annual_premium), getValue: (r) => r.annual_premium },
    { key: "_rate", label: "Commission Rate", render: (r) => r._rate != null ? formatPercent(r._rate) : "--" },
    { key: "_commission", label: "Commission Amount", render: (r) => r._commission != null ? formatCurrency(r._commission) : "--" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Team Production</h1>
          <Tabs value={view} onValueChange={(v) => setView(v as any)}>
            <TabsList>
              <TabsTrigger value="individual">Individual View</TabsTrigger>
              <TabsTrigger value="grouped">Grouped by Agent</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-wrap gap-3">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
          <Select value={carrier} onValueChange={setCarrier}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Carriers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {[...new Set(downlinePolicies.map((p) => p.carrier).filter(Boolean))].sort().map((c) => (
                <SelectItem key={c!} value={c!}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All Agents" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {downlineAgents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.first_name} {a.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <SkeletonTable columns={10} />
        ) : enriched.length === 0 ? (
          <EmptyState title="No team production yet" description="Your downline agents' policies will appear here." />
        ) : view === "individual" ? (
          <DataTable
            columns={columns}
            data={enriched}
            pageSize={25}
            exportFilename="team-production.csv"
            summaryRow={
              <div className="flex gap-6 rounded-lg border border-border bg-muted/50 p-3 text-sm font-medium">
                <span>Total: {formatCurrency(totalPremium)} premium</span>
                <span>|</span>
                <span>{formatCurrency(totalCommission)} commission</span>
              </div>
            }
          />
        ) : (
          // Grouped view
          <div className="space-y-4">
            {downlineAgents
              .filter((a) => enriched.some((p) => p.resolved_agent_id === a.id))
              .map((agent) => {
                const agentPolicies = enriched.filter((p) => p.resolved_agent_id === agent.id);
                const agentPrem = agentPolicies.reduce((s, p) => s + (p.annual_premium || 0), 0);
                const agentComm = agentPolicies.reduce((s, p) => s + (p._commission || 0), 0);
                return (
                  <div key={agent.id} className="rounded-lg border border-border">
                    <div className="flex items-center justify-between bg-muted/50 p-3 font-medium text-foreground">
                      <span>{agent.first_name} {agent.last_name} — {agent.position || "Agent"}</span>
                      <span className="text-sm">{formatCurrency(agentPrem)} premium | {formatCurrency(agentComm)} commission</span>
                    </div>
                    <DataTable columns={columns.filter((c) => c.key !== "_agentName")} data={agentPolicies} pageSize={100} />
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default TeamProduction;
