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
import { useCommissionPayouts } from "@/hooks/useCommissionPayouts";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUSES = ["Active", "Submitted", "Pending", "Terminated"];

const TeamProduction = () => {
  const { data: currentAgent } = useCurrentAgent();
  const { data: agents } = useAgents();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [carrier, setCarrier] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: allPolicies, isLoading, error, refetch } = usePolicies({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    carrier: carrier || undefined,
    status: statusFilter ? [statusFilter] : undefined,
  });

  const { data: payouts } = useCommissionPayouts();

  // Exclude current agent's own policies
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

  // Build commission lookup: policy_id → total commission
  const commissionByPolicy = useMemo(() => {
    const map = new Map<string, number>();
    if (!payouts) return map;
    for (const p of payouts) {
      map.set(p.policy_id, (map.get(p.policy_id) || 0) + (p.commission_amount || 0));
    }
    return map;
  }, [payouts]);

  const enriched = useMemo(() => {
    return filteredPolicies.map((p) => ({
      ...p,
      _agentName: getAgentName(p.resolved_agent_id),
      _commission: commissionByPolicy.get(p.id) || 0,
    }));
  }, [filteredPolicies, agents, commissionByPolicy]);

  const totalPolicies = enriched.length;
  const totalPremium = enriched.reduce((s, p) => s + (p.annual_premium || 0), 0);
  const totalCommission = enriched.reduce((s, p) => s + p._commission, 0);

  // Derive carriers from data
  const carriers = useMemo(() => {
    return [...new Set(downlinePolicies.map((p) => p.carrier).filter(Boolean))].sort() as string[];
  }, [downlinePolicies]);

  const columns: Column<(typeof enriched)[number]>[] = [
    { key: "_agentName", label: "Writing Agent" },
    { key: "client_name", label: "Client Name" },
    { key: "carrier", label: "Carrier" },
    { key: "product", label: "Product" },
    { key: "annual_premium", label: "Annual Premium", render: (r) => formatCurrency(r.annual_premium), getValue: (r) => r.annual_premium },
    { key: "application_date", label: "Application Date", render: (r) => formatDate(r.application_date) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "contract_type", label: "Contract Type", render: (r) => r.contract_type || "--" },
    { key: "_commission", label: "Commission", render: (r) => formatCurrency(r._commission), getValue: (r) => r._commission },
  ];

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Team Production</h1>

        <div className="flex flex-wrap gap-3">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
          <Select value={carrier} onValueChange={(v) => setCarrier(v === "all" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Carriers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Carriers</SelectItem>
              {carriers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={(v) => setAgentFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All Agents" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {downlineAgents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.first_name} {a.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary bar */}
        <div className="flex gap-6 rounded-lg border border-border bg-muted/50 p-3 text-sm font-medium">
          <span>{totalPolicies} policies</span>
          <span className="text-muted-foreground">|</span>
          <span>{formatCurrency(totalPremium)} premium</span>
          <span className="text-muted-foreground">|</span>
          <span>{formatCurrency(totalCommission)} commission</span>
        </div>

        {isLoading ? (
          <SkeletonTable columns={9} />
        ) : enriched.length === 0 ? (
          <EmptyState title="No team production yet" description="Your downline agents' policies will appear here." />
        ) : (
          <DataTable
            columns={columns}
            data={enriched}
            pageSize={25}
            exportFilename="team-production.csv"
          />
        )}
      </div>
    </AppLayout>
  );
};

export default TeamProduction;
