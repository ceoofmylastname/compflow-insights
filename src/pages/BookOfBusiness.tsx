import React, { useState, useMemo, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { usePolicies, Policy } from "@/hooks/usePolicies";
import { useAgents } from "@/hooks/useAgents";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useCommissionPayouts } from "@/hooks/useCommissionPayouts";
import { calculateAndSavePayouts } from "@/lib/commission-engine";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const POLICY_STATUSES = ["Submitted", "Pending", "Active", "Terminated"];

const BookOfBusiness = () => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [carrier, setCarrier] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedPolicyId, setExpandedPolicyId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: policies, isLoading, error, refetch } = usePolicies({
    search: debouncedSearch || undefined,
    carrier: carrier || undefined,
    status: statusFilter ? [statusFilter] : undefined,
    agentId: agentFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const { data: agents } = useAgents();

  const { data: expandedPayouts, isLoading: payoutsLoading } = useCommissionPayouts(
    expandedPolicyId ? { policyId: expandedPolicyId } : {}
  );

  const getAgentName = (id: string | null) => {
    const a = agents?.find((x) => x.id === id);
    return a ? `${a.first_name} ${a.last_name}` : "--";
  };

  const carriers = useMemo(() => {
    return [...new Set((policies ?? []).map((p) => p.carrier).filter(Boolean))].sort() as string[];
  }, [policies]);

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
      render: (r) =>
        isOwner ? (
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
        ),
    },
    { key: "annual_premium", label: "Annual Premium", render: (r) => formatCurrency(r.annual_premium), getValue: (r) => r.annual_premium },
    { key: "resolved_agent_id", label: "Writing Agent", render: (r) => getAgentName(r.resolved_agent_id) },
    { key: "application_date", label: "Application Date", render: (r) => formatDate(r.application_date) },
  ];

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Book of Business</h1>

        <div className="flex flex-wrap gap-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client name..." className="w-64" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {POLICY_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={carrier} onValueChange={setCarrier}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Carriers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {carriers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
        </div>

        {isLoading ? (
          <SkeletonTable />
        ) : (policies ?? []).length === 0 ? (
          <EmptyState title="No policies found" description="Your book of business will appear here after importing policies." />
        ) : (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  {columns.map((col) => (
                    <TableHead key={String(col.key)}>{col.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(policies ?? []).map((policy) => {
                  const isExpanded = expandedPolicyId === policy.id;
                  return (
                    <React.Fragment key={policy.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
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
                        <TableRow key={`${policy.id}-payouts`}>
                          <TableCell colSpan={columns.length + 1} className="bg-muted/30 p-0">
                            <div className="px-6 py-3">
                              <p className="text-sm font-semibold text-foreground mb-2">Commission Payouts</p>
                              {payoutsLoading ? (
                                <p className="text-sm text-muted-foreground">Loading…</p>
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
        )}
      </div>
    </AppLayout>
  );
};

export default BookOfBusiness;
