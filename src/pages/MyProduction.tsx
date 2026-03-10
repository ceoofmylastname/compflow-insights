import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { usePolicies, Policy } from "@/hooks/usePolicies";
import { useCommissionLevels, lookupCommissionRate } from "@/hooks/useCommissionLevels";
import { formatCurrency, formatPercent, formatDate } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CSVImportModal } from "@/components/shared/CSVImportModal";

const MyProduction = () => {
  const { data: currentAgent } = useCurrentAgent();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [carrier, setCarrier] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [contractType, setContractType] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const { data: policies, isLoading, error, refetch } = usePolicies({
    resolvedAgentId: currentAgent?.id,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    carrier: carrier || undefined,
    status: statusFilter.length > 0 ? statusFilter : undefined,
    contractType: contractType || undefined,
  });
  const { data: levels } = useCommissionLevels();

  const carriers = useMemo(() => {
    const set = new Set((policies ?? []).map((p) => p.carrier).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [policies]);

  const enriched = useMemo(() => {
    if (!policies || !levels) return [];
    return policies.map((p) => {
      const rate = lookupCommissionRate(levels, p.carrier, currentAgent?.position || null, p.application_date);
      return { ...p, _rate: rate, _commission: rate != null && p.annual_premium ? p.annual_premium * rate : null };
    });
  }, [policies, levels, currentAgent]);

  const totalPremium = enriched.reduce((s, p) => s + (p.annual_premium || 0), 0);
  const totalCommission = enriched.reduce((s, p) => s + (p._commission || 0), 0);

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
        <h1 className="text-2xl font-bold text-foreground">My Production</h1>

        <div className="flex flex-wrap gap-3">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From" className="w-40" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To" className="w-40" />
          <Select value={carrier} onValueChange={setCarrier}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Carriers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Carriers</SelectItem>
              {carriers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={contractType} onValueChange={setContractType}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Types" /></SelectTrigger>
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
            description="Import a policy report to see your production data."
            action={{ label: "Import CSV", onClick: () => setImportOpen(true) }}
          />
        ) : (
          <DataTable
            columns={columns}
            data={enriched}
            pageSize={25}
            exportFilename="my-production.csv"
            summaryRow={
              <div className="flex gap-6 rounded-lg border border-border bg-muted/50 p-3 text-sm font-medium text-foreground">
                <span>Total: {formatCurrency(totalPremium)} premium</span>
                <span>|</span>
                <span>{formatCurrency(totalCommission)} commission</span>
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
