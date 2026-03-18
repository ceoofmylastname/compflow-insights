import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { usePolicies, Policy, getPoliciesArray } from "@/hooks/usePolicies";
import { useCommissionPayouts } from "@/hooks/useCommissionPayouts";
import { formatCurrency, formatPercent, formatDate } from "@/lib/formatters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CSVImportModal } from "@/components/shared/CSVImportModal";
import { Progress } from "@/components/ui/progress";
import { useFilters } from "@/contexts/FilterContext";
import { useCarrierOptions } from "@/hooks/useCarrierOptions";
import { useCanImport } from "@/hooks/useCanImport";

const STATUSES = ["Active", "Submitted", "Pending", "Terminated"];

const MyProduction = () => {
  const { data: currentAgent } = useCurrentAgent();
  const { dateFrom, dateTo } = useFilters();
  const [carrier, setCarrier] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [contractType, setContractType] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const { canImport } = useCanImport();

  const policyFilters = useMemo(() => ({
    resolvedAgentId: currentAgent?.id,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    carrier: carrier && carrier !== "all" ? carrier : undefined,
    status: statusFilter && statusFilter !== "all" ? [statusFilter] : undefined,
    contractType: contractType && contractType !== "all" ? contractType : undefined,
  }), [currentAgent?.id, dateFrom, dateTo, carrier, statusFilter, contractType]);

  const { data: policiesRaw, isLoading, error, refetch } = usePolicies(policyFilters);
  const policies = getPoliciesArray(policiesRaw);
  const { data: payouts } = useCommissionPayouts({ agentId: currentAgent?.id });

  // Build commission map from actual payouts (direct only)
  const commissionByPolicy = useMemo(() => {
    const map = new Map<string, { rate: number | null; amount: number | null }>();
    if (!payouts) return map;
    for (const p of payouts) {
      if (p.payout_type === "direct") {
        map.set(p.policy_id, { rate: p.commission_rate, amount: p.commission_amount });
      }
    }
    return map;
  }, [payouts]);

  const { carriers } = useCarrierOptions();

  const enriched = useMemo(() => {
    return policies.map((p) => {
      const comm = commissionByPolicy.get(p.id);
      return { ...p, _rate: comm?.rate ?? null, _commission: comm?.amount ?? null };
    });
  }, [policies, commissionByPolicy]);

  const subPremium = enriched.filter(p => p.status === "Submitted").reduce((s, p) => s + (p.annual_premium || 0), 0);
  const actPremium = enriched.filter(p => p.status === "Active").reduce((s, p) => s + (p.annual_premium || 0), 0);
  const subCommission = enriched.filter(p => p.status === "Submitted").reduce((s, p) => s + (p._commission || 0), 0);
  const actCommission = enriched.filter(p => p.status === "Active").reduce((s, p) => s + (p._commission || 0), 0);
  const totalRefsCollected = enriched.reduce((s, p) => s + (p.refs_collected || 0), 0);
  const totalRefsSold = enriched.reduce((s, p) => s + (p.refs_sold || 0), 0);
  const annualGoal = Number(currentAgent?.annual_goal) || 0;
  const goalPercent = annualGoal > 0 ? Math.min(100, (actCommission / annualGoal) * 100) : 0;

  const columns: Column<typeof enriched[number]>[] = [
    { key: "policy_number", label: "Policy Number" },
    { key: "client_name", label: "Client Name" },
    { key: "carrier", label: "Carrier" },
    { key: "product", label: "Product" },
    { key: "application_date", label: "Application Date", render: (r) => formatDate(r.application_date) },
    { key: "annual_premium", label: "Annual Premium", render: (r) => formatCurrency(r.annual_premium), getValue: (r) => r.annual_premium },
    { key: "_rate", label: "Commission Rate", render: (r) => r._rate != null ? formatPercent(r._rate) : "--", getValue: (r) => r._rate },
    { key: "_commission", label: "Commission Amount", render: (r) => r._commission != null ? formatCurrency(r._commission) : "--", getValue: (r) => r._commission },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "contract_type", label: "Contract Type" },
  ];

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">My Production</h1>

        {/* Summary bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="card-elevated p-4 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Submitted Premium</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(subPremium)}</p>
          </div>
          <div className="card-elevated p-4 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Active Premium</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(actPremium)}</p>
          </div>
          <div className="card-elevated p-4 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Submitted Comm.</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(subCommission)}</p>
          </div>
          <div className="card-elevated p-4 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Issued Comm.</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(actCommission)}</p>
          </div>
          <div className="card-elevated p-4 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Goal Progress</p>
            <p className="text-lg font-bold text-foreground">{goalPercent.toFixed(0)}%</p>
            <Progress value={goalPercent} className="h-2" />
          </div>
          <div className="card-elevated p-4 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Refs Collected</p>
            <p className="text-lg font-bold text-foreground">{totalRefsCollected}</p>
          </div>
          <div className="card-elevated p-4 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Refs Sold</p>
            <p className="text-lg font-bold text-foreground">{totalRefsSold}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="card-elevated p-3 flex flex-wrap gap-3 items-center">
          <Select value={carrier} onValueChange={setCarrier}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All Carriers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Carriers</SelectItem>
              {carriers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={contractType} onValueChange={setContractType}>
            <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="Direct Pay">Direct Pay</SelectItem>
              <SelectItem value="LOA">LOA</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <SkeletonTable columns={10} />
        ) : enriched.length === 0 ? (
          <EmptyState
            title="No policies yet"
            description={canImport ? "Import a policy report to see your production data." : "Your manager handles policy imports."}
            action={canImport ? { label: "Import CSV", onClick: () => setImportOpen(true) } : undefined}
          />
        ) : (
          <DataTable
            columns={columns}
            data={enriched}
            pageSize={25}
            exportFilename="my-production.csv"
            summaryRow={
              <div className="flex gap-6 rounded-lg border border-border bg-muted/50 p-3 text-sm font-medium text-foreground">
                <span>Submitted: {formatCurrency(subPremium)} / {formatCurrency(subCommission)}</span>
                <span>|</span>
                <span>Active: {formatCurrency(actPremium)} / {formatCurrency(actCommission)}</span>
              </div>
            }
          />
        )}
      </div>
      <CSVImportModal open={importOpen} onOpenChange={setImportOpen} defaultTab="policies" />
    </AppLayout>
  );
};

export default MyProduction;
