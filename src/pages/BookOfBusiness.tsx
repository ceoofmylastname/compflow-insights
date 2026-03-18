import React, { useState, useMemo, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { usePolicies, Policy, isPaginatedResult } from "@/hooks/usePolicies";
import { useAgents } from "@/hooks/useAgents";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useCommissionPayouts } from "@/hooks/useCommissionPayouts";
import { calculateAndSavePayouts } from "@/lib/commission-engine";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, PlusCircle, AlertTriangle, Settings2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PostDealModal } from "@/components/policies/PostDealModal";
import { useFilters } from "@/contexts/FilterContext";
import { useCarrierOptions } from "@/hooks/useCarrierOptions";
import { useCanImport } from "@/hooks/useCanImport";

const POLICY_STATUSES = ["Submitted", "Pending", "Active", "Terminated"];
const PAGE_SIZE = 50;

const BookOfBusiness = () => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [carrier, setCarrier] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const { dateFrom, dateTo } = useFilters();
  const [expandedPolicyId, setExpandedPolicyId] = useState<string | null>(null);
  const [postDealOpen, setPostDealOpen] = useState(false);
  const [showLeadSource, setShowLeadSource] = useState(false);
  const [showEffectiveDate, setShowEffectiveDate] = useState(true);
  const [showPhone, setShowPhone] = useState(false);
  const [hasRiskFilter, setHasRiskFilter] = useState(false);
  const [loaOnlyFilter, setLoaOnlyFilter] = useState(false);
  const [leadSourceFilter, setLeadSourceFilter] = useState("");
  const [contractTypeFilter, setContractTypeFilter] = useState("");
  const [page, setPage] = useState(1);

  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();
  const { canImport } = useCanImport();

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when filters change
  const handleFilterChange = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const { data: result, isLoading, error, refetch } = usePolicies({
    search: debouncedSearch || undefined,
    carrier: carrier && carrier !== "all" ? carrier : undefined,
    status: statusFilter && statusFilter !== "all" ? [statusFilter] : undefined,
    agentId: agentFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    leadSource: leadSourceFilter && leadSourceFilter !== "all" ? leadSourceFilter : undefined,
    contractType: contractTypeFilter && contractTypeFilter !== "all" ? contractTypeFilter : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const policies = isPaginatedResult(result) ? result.data : (result as Policy[] | undefined) ?? [];
  const totalCount = isPaginatedResult(result) ? result.count : policies.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const { data: agents } = useAgents();

  // Also fetch all policies (unpaginated) just for carrier dropdown
  const { data: allPoliciesRaw } = usePolicies({});
  const allPolicies = Array.isArray(allPoliciesRaw) ? allPoliciesRaw : [];

  const { data: expandedPayouts, isLoading: payoutsLoading } = useCommissionPayouts(
    expandedPolicyId ? { policyId: expandedPolicyId } : {}
  );

  const getAgentName = (id: string | null) => {
    const a = agents?.find((x) => x.id === id);
    return a ? `${a.first_name} ${a.last_name}` : "--";
  };

  const { carriers } = useCarrierOptions();

  const leadSources = useMemo(() => {
    return [...new Set(allPolicies.map((p) => p.lead_source).filter(Boolean))].sort() as string[];
  }, [allPolicies]);

  // Apply client-side chargeback risk filter
  const filteredPolicies = useMemo(() => {
    let result = policies;
    if (hasRiskFilter) {
      result = result.filter((p) => p.chargeback_risk === true);
    }
    if (loaOnlyFilter) {
      result = result.filter((p) => p.contract_type === "LOA");
    }
    return result;
  }, [policies, hasRiskFilter, loaOnlyFilter]);

  const handleStatusChange = async (policyId: string, newStatus: string) => {
    const { error } = await supabase
      .from("policies")
      .update({ status: newStatus })
      .eq("id", policyId);
    if (error) {
      toast.error("Failed to update status");
      return;
    }
    try {
      await calculateAndSavePayouts(policyId, supabase);
    } catch {}
    queryClient.invalidateQueries({ queryKey: ["policies"] });
    queryClient.invalidateQueries({ queryKey: ["commissionPayouts"] });
    toast.success(`Status updated to ${newStatus}`);
  };

  const isOwner = currentAgent?.is_owner ?? false;

  const columns: Column<Policy>[] = [
    { key: "client_name", label: "Client Name" },
    { key: "carrier", label: "Carrier" },
    { key: "product", label: "Product" },
    { key: "policy_number", label: "Policy Number" },
    {
      key: "status",
      label: "Status",
      render: (r) => {
        const hasRisk = r.chargeback_risk === true;
        const statusEl = isOwner ? (
          <div onClick={(e) => e.stopPropagation()}>
            <Select value={r.status || ""} onValueChange={(v) => handleStatusChange(r.id, v)}>
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLICY_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <StatusBadge status={r.status} />
        );
        return (
          <div className="flex items-center gap-1.5">
            {statusEl}
            {hasRisk && (
              <span title="Chargeback risk"><AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" /></span>
            )}
          </div>
        );
      },
    },
    { key: "annual_premium", label: "Annual Premium", render: (r) => formatCurrency(r.annual_premium), getValue: (r) => r.annual_premium },
    { key: "resolved_agent_id", label: "Writing Agent", render: (r) => getAgentName(r.resolved_agent_id) },
    { key: "application_date", label: "Application Date", render: (r) => formatDate(r.application_date) },
  ];

  // Effective date column (visible by default)
  if (showEffectiveDate) {
    columns.push({
      key: "effective_date",
      label: "Effective Date",
      render: (r) => formatDate(r.effective_date),
    });
  }

  // Lead source column (hidden by default)
  if (showLeadSource) {
    columns.push({
      key: "lead_source",
      label: "Lead Source",
      render: (r) => r.lead_source || "--",
    });
  }

  // Agent phone column (hidden by default)
  if (showPhone) {
    columns.push({
      key: "resolved_agent_id" as keyof Policy,
      label: "Agent Phone",
      render: (r) => {
        const a = agents?.find((x) => x.id === r.resolved_agent_id);
        return a?.phone || "--";
      },
    });
  }

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  const fromItem = (page - 1) * PAGE_SIZE + 1;
  const toItem = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Book of Business</h1>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings2 className="mr-2 h-4 w-4" /> Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48" align="end">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Toggle Columns</p>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={showEffectiveDate}
                      onCheckedChange={(v) => setShowEffectiveDate(!!v)}
                    />
                    Effective Date
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={showLeadSource}
                      onCheckedChange={(v) => setShowLeadSource(!!v)}
                    />
                    Lead Source
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={showPhone}
                      onCheckedChange={(v) => setShowPhone(!!v)}
                    />
                    Agent Phone
                  </label>
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" onClick={() => setPostDealOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" /> Post a Deal
            </Button>
          </div>
        </div>

        <div className="card-elevated p-3 flex flex-wrap gap-3 items-center">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client name..." className="w-64" />
          <Select value={statusFilter} onValueChange={handleFilterChange(setStatusFilter)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {POLICY_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={carrier} onValueChange={handleFilterChange(setCarrier)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Carriers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {carriers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={contractTypeFilter} onValueChange={handleFilterChange(setContractTypeFilter)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="All Contracts" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="Direct Pay">Direct Pay</SelectItem>
              <SelectItem value="LOA">LOA</SelectItem>
            </SelectContent>
          </Select>
          {leadSources.length > 0 && (
            <Select value={leadSourceFilter} onValueChange={handleFilterChange(setLeadSourceFilter)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All Sources" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {leadSources.map((ls) => <SelectItem key={ls} value={ls}>{ls}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={loaOnlyFilter}
              onCheckedChange={(v) => setLoaOnlyFilter(!!v)}
            />
            LOA Only
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={hasRiskFilter}
              onCheckedChange={(v) => setHasRiskFilter(!!v)}
            />
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" /> Has Risk
            </span>
          </label>
        </div>

        {isLoading ? (
          <SkeletonTable />
        ) : filteredPolicies.length === 0 ? (
          <EmptyState
            title="No policies found"
            description={canImport
              ? "Your book of business will appear here after importing policies."
              : "Your manager will upload carrier reports which will automatically populate your book of business. You can also post individual deals using the Post a Deal button."
            }
          />
        ) : (
          <>
            <div className="card-elevated overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-b-2 border-border bg-gradient-to-r from-muted/60 to-muted/30 hover:bg-transparent">
                    <TableHead className="w-8"></TableHead>
                    {columns.map((col) => (
                      <TableHead key={String(col.key)} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10">{col.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPolicies.map((policy) => {
                    const isExpanded = expandedPolicyId === policy.id;
                    return (
                      <React.Fragment key={policy.id}>
                        <TableRow
                          className="cursor-pointer border-b border-border/50 table-row-hover"
                          onClick={() => setExpandedPolicyId(isExpanded ? null : policy.id)}
                        >
                          <TableCell className="w-8 px-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          {columns.map((col) => (
                            <TableCell key={String(col.key)}>
                              {col.render ? col.render(policy) : String((policy as any)[col.key] ?? "")}
                            </TableCell>
                          ))}
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${policy.id}-detail`}>
                            <TableCell colSpan={columns.length + 1} className="bg-accent/20 p-0">
                              <div className="px-6 py-3 space-y-3">
                                {/* Policy Details */}
                                <div>
                                  <p className="text-sm font-semibold text-foreground mb-2">Policy Details</p>
                                  <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground">Contract Type:</span>
                                      <span className="text-foreground flex items-center gap-1.5">
                                        {policy.contract_type || "--"}
                                        {policy.contract_type === "LOA" && (
                                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500 text-amber-700 dark:text-amber-400">LOA</Badge>
                                        )}
                                      </span>
                                    </div>
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground">Modal Premium:</span>
                                      <span className="text-foreground">{(policy as any).modal_premium ? formatCurrency((policy as any).modal_premium) : "--"}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground">Billing Interval:</span>
                                      <span className="text-foreground">{(policy as any).billing_interval || "--"}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground">Client Phone:</span>
                                      <span className="text-foreground">{policy.client_phone || "--"}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground">Client DOB:</span>
                                      <span className="text-foreground">{formatDate(policy.client_dob)}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground">Refs:</span>
                                      <span className="text-foreground">{policy.refs_collected ?? 0} collected / {policy.refs_sold ?? 0} sold</span>
                                    </div>
                                  </div>
                                </div>
                                <p className="text-sm font-semibold text-foreground">Commission Payouts</p>
                                {payoutsLoading ? (
                                  <p className="text-sm text-muted-foreground">Loading...</p>
                                ) : !expandedPayouts || expandedPayouts.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No payouts calculated for this policy.</p>
                                ) : (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Agent</TableHead>
                                        <TableHead>Position</TableHead>
                                        <TableHead>Rate</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Contract</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {expandedPayouts.map((p) => (
                                        <TableRow key={p.id}>
                                          <TableCell>{p.agent_name}</TableCell>
                                          <TableCell>{p.agent_position}</TableCell>
                                          <TableCell>{p.commission_rate != null ? `${(p.commission_rate * 100).toFixed(1)}%` : "--"}</TableCell>
                                          <TableCell>{p.commission_amount != null ? formatCurrency(p.commission_amount) : "--"}</TableCell>
                                          <TableCell>
                                            <Badge variant={p.payout_type === "override" ? "secondary" : "default"}>
                                              {p.payout_type}
                                            </Badge>
                                          </TableCell>
                                          <TableCell>
                                            {p.contract_type ? (
                                              <Badge variant="outline">{p.contract_type}</Badge>
                                            ) : "--"}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                )}
                                {/* Notes section */}
                                {policy.notes && (
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">Notes</p>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{policy.notes}</p>
                                  </div>
                                )}
                                {/* Custom fields section */}
                                {policy.custom_fields && typeof policy.custom_fields === "object" && !Array.isArray(policy.custom_fields) && Object.keys(policy.custom_fields as Record<string, string>).length > 0 && (
                                  <div>
                                    <p className="text-sm font-semibold text-foreground mb-2">Carrier Data</p>
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                                      {Object.entries(policy.custom_fields as Record<string, string>).map(([key, value]) => (
                                        <div key={key} className="flex gap-2 text-sm">
                                          <span className="text-muted-foreground shrink-0">{key}:</span>
                                          <span className="text-foreground">{value || "--"}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
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
      <PostDealModal open={postDealOpen} onOpenChange={setPostDealOpen} />
    </AppLayout>
  );
};

export default BookOfBusiness;
