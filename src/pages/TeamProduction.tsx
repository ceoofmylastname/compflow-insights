import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { usePolicies, Policy, isPaginatedResult, getPoliciesArray } from "@/hooks/usePolicies";
import { useAgents } from "@/hooks/useAgents";
import { useCommissionPayouts } from "@/hooks/useCommissionPayouts";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFilters } from "@/contexts/FilterContext";
import { useCarrierOptions } from "@/hooks/useCarrierOptions";

const STATUSES = ["Active", "Submitted", "Pending", "Terminated"];
const PAGE_SIZE = 50;

const TeamProduction = () => {
  const { data: currentAgent } = useCurrentAgent();
  const { data: agents } = useAgents();
  const { dateFrom, dateTo } = useFilters();
  const [carrier, setCarrier] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [contractTypeFilter, setContractTypeFilter] = useState("");
  const [leadSourceFilter, setLeadSourceFilter] = useState("");
  const [page, setPage] = useState(1);

  const handleFilterChange = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const { data: result, isLoading, error, refetch } = usePolicies({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    carrier: carrier && carrier !== "all" ? carrier : undefined,
    status: statusFilter && statusFilter !== "all" ? [statusFilter] : undefined,
    agentId: agentFilter && agentFilter !== "all" ? agentFilter : undefined,
    contractType: contractTypeFilter && contractTypeFilter !== "all" ? contractTypeFilter : undefined,
    leadSource: leadSourceFilter && leadSourceFilter !== "all" ? leadSourceFilter : undefined,
    excludeAgentId: currentAgent?.id,
    page,
    pageSize: PAGE_SIZE,
  });

  const policies = isPaginatedResult(result) ? result.data : getPoliciesArray(result);
  const totalCount = isPaginatedResult(result) ? result.count : policies.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const { data: payouts } = useCommissionPayouts();

  // Also fetch unpaginated for carrier list
  const { data: allPoliciesRaw } = usePolicies({ excludeAgentId: currentAgent?.id });
  const allDownlinePolicies = getPoliciesArray(allPoliciesRaw);

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
    return policies.map((p) => ({
      ...p,
      _agentName: getAgentName(p.resolved_agent_id),
      _commission: commissionByPolicy.get(p.id) || 0,
    }));
  }, [policies, agents, commissionByPolicy]);

  const totalPolicies = totalCount;
  const totalPremium = enriched.reduce((s, p) => s + (p.annual_premium || 0), 0);
  const totalCommission = enriched.reduce((s, p) => s + p._commission, 0);
  const totalRefsCollected = enriched.reduce((s, p) => s + (p.refs_collected || 0), 0);
  const totalRefsSold = enriched.reduce((s, p) => s + (p.refs_sold || 0), 0);

  const { carriers } = useCarrierOptions();

  const leadSources = useMemo(() => {
    return [...new Set(allDownlinePolicies.map((p) => p.lead_source).filter(Boolean))].sort() as string[];
  }, [allDownlinePolicies]);

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  const fromItem = (page - 1) * PAGE_SIZE + 1;
  const toItem = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Team Production</h1>

        <div className="card-elevated p-3 flex flex-wrap gap-3">
          <Select value={carrier} onValueChange={handleFilterChange((v: string) => setCarrier(v === "all" ? "" : v))}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All Carriers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Carriers</SelectItem>
              {carriers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={handleFilterChange((v: string) => setStatusFilter(v === "all" ? "" : v))}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={contractTypeFilter} onValueChange={handleFilterChange((v: string) => setContractTypeFilter(v === "all" ? "" : v))}>
            <SelectTrigger className="w-36"><SelectValue placeholder="All Contracts" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="Direct Pay">Direct Pay</SelectItem>
              <SelectItem value="LOA">LOA</SelectItem>
            </SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={handleFilterChange((v: string) => setAgentFilter(v === "all" ? "" : v))}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All Agents" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {downlineAgents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.first_name} {a.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {leadSources.length > 0 && (
            <Select value={leadSourceFilter} onValueChange={handleFilterChange((v: string) => setLeadSourceFilter(v === "all" ? "" : v))}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All Sources" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {leadSources.map((ls) => <SelectItem key={ls} value={ls}>{ls}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Summary bar */}
        <div className="card-elevated p-4 flex gap-6 text-sm font-medium flex-wrap">
          <span>{totalPolicies} policies</span>
          <span className="text-muted-foreground">|</span>
          <span>{formatCurrency(totalPremium)} premium</span>
          <span className="text-muted-foreground">|</span>
          <span>{formatCurrency(totalCommission)} commission</span>
          <span className="text-muted-foreground">|</span>
          <span>{totalRefsCollected} refs collected</span>
          <span className="text-muted-foreground">|</span>
          <span>{totalRefsSold} refs sold</span>
        </div>

        {isLoading ? (
          <SkeletonTable columns={9} />
        ) : enriched.length === 0 ? (
          <EmptyState title="No team production yet" description="Your downline agents' policies will appear here." />
        ) : (
          <>
            <div className="card-elevated overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-b-2 border-border bg-gradient-to-r from-muted/60 to-muted/30 hover:bg-transparent">
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10">Writing Agent</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10">Client Name</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10">Carrier</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10">Product</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10">Annual Premium</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10">Application Date</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10">Status</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10">Contract Type</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10">Commission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enriched.map((p) => (
                    <TableRow key={p.id} className="border-b border-border/50 table-row-hover">
                      <TableCell className="text-sm py-3">{p._agentName}</TableCell>
                      <TableCell className="text-sm py-3">{p.client_name}</TableCell>
                      <TableCell className="text-sm py-3">{p.carrier}</TableCell>
                      <TableCell className="text-sm py-3">{p.product}</TableCell>
                      <TableCell className="text-sm py-3">{formatCurrency(p.annual_premium)}</TableCell>
                      <TableCell className="text-sm py-3">{formatDate(p.application_date)}</TableCell>
                      <TableCell className="py-3"><StatusBadge status={p.status} /></TableCell>
                      <TableCell className="text-sm py-3">{p.contract_type || "--"}</TableCell>
                      <TableCell className="text-sm py-3">{formatCurrency(p._commission)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination controls */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {fromItem}–{toItem} of {totalCount} results
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <span className="text-foreground font-medium">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default TeamProduction;
