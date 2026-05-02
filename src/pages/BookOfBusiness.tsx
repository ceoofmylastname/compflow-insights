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
import { ChevronDown, ChevronRight, PlusCircle, AlertTriangle, Settings2, ChevronLeft, Upload, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PostDealModal } from "@/components/policies/PostDealModal";
import { PolicyImportWizard, type ImportResult } from "@/components/import/PolicyImportWizard";
import { BulkDeletePoliciesModal, type BulkDeleteSummary } from "@/components/policies/BulkDeletePoliciesModal";
import { useFilters } from "@/contexts/FilterContext";
import { useCarrierOptions } from "@/hooks/useCarrierOptions";
import { useCanImport } from "@/hooks/useCanImport";

const POLICY_STATUSES = [
  "Submitted",
  "Pending",
  "Issued",
  "Issue Paid",
  "Potential Lapse",
  "Terminated",
];

/**
 * Bucket filter values per Wiki/schema-spec.md (Canonical policy status
 * model). Maps a label to the underlying status set the filter expands
 * to. Drafts are intentionally absent — the Drafts tab is a separate
 * surface scoped to the creator only.
 */
const BUCKET_FILTERS: Record<string, string[]> = {
  Pipeline: ["Submitted", "Pending"],
  Booked: ["Issued", "Active"], // 'Active' is the deprecated alias; included for half-deployed rows
  Realized: ["Issue Paid"],
  "At-risk": ["Potential Lapse"],
  Dead: ["Terminated"],
};

const PAGE_SIZE = 50;

const BookOfBusiness = () => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [carrier, setCarrier] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [bucketFilter, setBucketFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const { dateFrom, dateTo } = useFilters();
  const [expandedPolicyId, setExpandedPolicyId] = useState<string | null>(null);
  const [postDealOpen, setPostDealOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [showLeadSource, setShowLeadSource] = useState(false);
  const [showEffectiveDate, setShowEffectiveDate] = useState(true);
  const [showPhone, setShowPhone] = useState(false);
  const [hasRiskFilter, setHasRiskFilter] = useState(false);
  const [loaOnlyFilter, setLoaOnlyFilter] = useState(false);
  const [needsReviewFilter, setNeedsReviewFilter] = useState(false);
  const [unassignedFilter, setUnassignedFilter] = useState(false);
  const [leadSourceFilter, setLeadSourceFilter] = useState("");
  const [contractTypeFilter, setContractTypeFilter] = useState("");
  const [page, setPage] = useState(1);

  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();
  const { canImport } = useCanImport();

  // Bulk-delete selection state per Wiki/book-of-business-page.md
  // (owner bulk delete). Three modes:
  //   selectedIds: per-row checkbox set (page-scoped).
  //   selectAllMatching: when true, the action bar operates on every
  //                      row matching the current filter (not just the
  //                      visible page). Selection set in this mode is
  //                      derived on submit, not maintained here.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteSummary, setBulkDeleteSummary] = useState<BulkDeleteSummary | null>(null);
  const [matchingMetaLoading, setMatchingMetaLoading] = useState(false);

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
    // Status filter takes precedence; bucket filter expands to its
    // underlying status set when no specific status is picked.
    status:
      statusFilter && statusFilter !== "all"
        ? [statusFilter]
        : bucketFilter && bucketFilter !== "all"
          ? BUCKET_FILTERS[bucketFilter]
          : undefined,
    agentId: agentFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    leadSource: leadSourceFilter && leadSourceFilter !== "all" ? leadSourceFilter : undefined,
    contractType: contractTypeFilter && contractTypeFilter !== "all" ? contractTypeFilter : undefined,
    unassigned: unassignedFilter || undefined,
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

  // Apply client-side filters (chargeback risk, LOA, needs review)
  const filteredPolicies = useMemo(() => {
    let result = policies;
    if (hasRiskFilter) {
      result = result.filter((p) => p.chargeback_risk === true);
    }
    if (loaOnlyFilter) {
      result = result.filter((p) => p.contract_type === "LOA");
    }
    if (needsReviewFilter) {
      result = result.filter((p) => (p as any).needs_review === true);
    }
    return result;
  }, [policies, hasRiskFilter, loaOnlyFilter, needsReviewFilter]);

  // Drop the per-row selection any time the visible filter set changes
  // — selecting rows on one filter then changing filters would leave
  // stale ids in the set. Filter-scoped mode also resets here.
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedSearch, carrier, statusFilter, bucketFilter, agentFilter,
    dateFrom, dateTo, leadSourceFilter, contractTypeFilter,
    hasRiskFilter, loaOnlyFilter, needsReviewFilter, unassignedFilter,
  ]);

  const isOwnerForBulk = currentAgent?.is_owner ?? false;

  // Header-checkbox state for the visible page. Tri-state-ish via the
  // indeterminate flag on the underlying primitive.
  const visibleIds = useMemo(() => filteredPolicies.map((p) => p.id), [filteredPolicies]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  const toggleVisible = (checked: boolean) => {
    setSelectAllMatching(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const id of visibleIds) next.add(id);
      } else {
        for (const id of visibleIds) next.delete(id);
      }
      return next;
    });
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelectAllMatching(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // Premium total of the rows currently selected (page-scope only).
  const selectedPremiumOnPage = useMemo(() => {
    return filteredPolicies
      .filter((p) => selectedIds.has(p.id))
      .reduce((s, p) => s + (p.annual_premium || 0), 0);
  }, [filteredPolicies, selectedIds]);

  // Build the BulkDeleteSummary the modal needs. For page scope the ids
  // and totals are already in memory. For filter scope we re-query the
  // matching ids + totals from Supabase so the math reflects every row,
  // not just the current page.
  const openDeleteModal = async () => {
    if (!isOwnerForBulk) return;

    if (selectAllMatching) {
      setMatchingMetaLoading(true);
      try {
        // Re-build the same WHERE shape as usePolicies (page-agnostic).
        let q = supabase.from("policies").select("id, annual_premium").neq("status", "Draft");
        const statuses =
          statusFilter && statusFilter !== "all"
            ? [statusFilter]
            : bucketFilter && bucketFilter !== "all"
              ? BUCKET_FILTERS[bucketFilter]
              : undefined;
        if (statuses && statuses.length > 0) q = q.in("status", statuses);
        if (carrier && carrier !== "all") q = q.eq("carrier", carrier);
        if (agentFilter) q = q.eq("resolved_agent_id", agentFilter);
        if (contractTypeFilter && contractTypeFilter !== "all") q = q.eq("contract_type", contractTypeFilter);
        if (dateFrom) q = q.gte("application_date", dateFrom);
        if (dateTo) q = q.lte("application_date", dateTo);
        if (leadSourceFilter && leadSourceFilter !== "all") q = q.eq("lead_source", leadSourceFilter);
        if (debouncedSearch) q = q.ilike("client_name", `%${debouncedSearch}%`);

        const { data, error: matchErr } = await q;
        if (matchErr) throw matchErr;
        let matching = (data ?? []) as Array<{ id: string; annual_premium: number | null }>;

        // Client-side filters that don't have SQL equivalents in this
        // table (chargeback_risk, contract_type=LOA, needs_review) need
        // a follow-up filter pass against the in-memory page rows. The
        // filter-scoped path can't honor them perfectly without joining
        // the same client-side rules; for now if any of these are on
        // we narrow the matching set to ids that also satisfy the
        // visible page rules. This errs on the side of fewer deletes.
        const clientFilterActive = hasRiskFilter || loaOnlyFilter || needsReviewFilter;
        if (clientFilterActive) {
          const visibleSet = new Set(filteredPolicies.map((p) => p.id));
          matching = matching.filter((m) => visibleSet.has(m.id));
        }

        const policyIds = matching.map((m) => m.id);
        const totalPremium = matching.reduce((s, m) => s + (Number(m.annual_premium) || 0), 0);

        // Paid commission total for the filter-scoped set.
        let totalPaidCommission = 0;
        if (policyIds.length > 0) {
          const { data: payouts } = await (supabase
            .from("commission_payouts")
            .select("commission_amount")
            .in("policy_id", policyIds) as any)
            .eq("payment_status", "paid");
          totalPaidCommission = (payouts ?? []).reduce(
            (s, r: any) => s + (Number(r.commission_amount) || 0),
            0
          );
        }

        setBulkDeleteSummary({
          policyIds,
          totalPremium,
          totalPaidCommission,
          scope: "filter",
        });
        setBulkDeleteOpen(true);
      } catch (e: any) {
        toast.error(e.message || "Failed to compute filter totals");
      } finally {
        setMatchingMetaLoading(false);
      }
      return;
    }

    // Page-scope path: ids already in memory.
    const policyIds = Array.from(selectedIds);
    if (policyIds.length === 0) return;
    setMatchingMetaLoading(true);
    try {
      const { data: payouts } = await (supabase
        .from("commission_payouts")
        .select("commission_amount")
        .in("policy_id", policyIds) as any)
        .eq("payment_status", "paid");
      const totalPaidCommission = (payouts ?? []).reduce(
        (s, r: any) => s + (Number(r.commission_amount) || 0),
        0
      );
      setBulkDeleteSummary({
        policyIds,
        totalPremium: selectedPremiumOnPage,
        totalPaidCommission,
        scope: "page",
      });
      setBulkDeleteOpen(true);
    } catch (e: any) {
      toast.error(e.message || "Failed to compute selection totals");
    } finally {
      setMatchingMetaLoading(false);
    }
  };

  const handleDeleted = () => {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
    setBulkDeleteSummary(null);
  };

  const handleStatusChange = async (policyId: string, newStatus: string) => {
    const policy = policies.find(p => p.id === policyId);

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

    // Webhook fire on transition into Booked or Realized buckets per
    // Wiki/webhooks-and-culture-tools.md.
    //   policy.issued    fires when status moves from any non-booked
    //                    state into Issued (or the deprecated Active).
    //   policy.issue_paid fires when status moves into Issue Paid.
    // The legacy deal.posted event keeps firing on the issued
    // transition for back-compat with existing tenant webhooks.
    const wasIssued = policy?.status === "Issued" || policy?.status === "Active";
    const becameIssued = (newStatus === "Issued" || newStatus === "Active") && !wasIssued;
    const becameIssuePaid = newStatus === "Issue Paid" && policy?.status !== "Issue Paid";
    if (policy && (becameIssued || becameIssuePaid) && currentAgent) {
      try {
        const eventName = becameIssuePaid ? "policy.issue_paid" : "policy.issued";
        const { data: activeWebhooks } = await supabase
          .from("webhook_configs")
          .select("webhook_url, event_type")
          .eq("tenant_id", currentAgent.tenant_id)
          .eq("is_active", true)
          .in("event_type", becameIssuePaid
            ? [eventName as any]
            : [eventName as any, "deal.posted" as any]);

        if (activeWebhooks && activeWebhooks.length > 0) {
          const agent = agents?.find(a => a.id === policy.resolved_agent_id);
          const webhookPayload = {
            event: eventName,
            policy_number: policy.policy_number || "",
            client_name: policy.client_name || "",
            carrier: policy.carrier || "",
            product: policy.product || "",
            annual_premium: policy.annual_premium || 0,
            agent_email: agent?.email || "",
            application_date: policy.application_date || "",
            status: newStatus,
          };
          for (const config of activeWebhooks) {
            await supabase.functions.invoke("fire-webhook", {
              body: { webhook_url: config.webhook_url, payload: webhookPayload },
            });
          }
        }
      } catch (e) {
        console.error("Failed to fire webhooks on status transition", e);
      }
    }

    // policy.submitted fires when status enters the Submitted bucket
    // (e.g. an owner flips a Pending policy back to Submitted, or a
    // Draft is promoted via this dropdown). Draft state itself never
    // fires a webhook.
    const becameSubmitted = newStatus === "Submitted" && policy?.status !== "Submitted";
    if (policy && becameSubmitted && currentAgent) {
      try {
        const { data: submittedHooks } = await supabase
          .from("webhook_configs")
          .select("webhook_url")
          .eq("tenant_id", currentAgent.tenant_id)
          .eq("is_active", true)
          .eq("event_type", "policy.submitted" as any);

        if (submittedHooks && submittedHooks.length > 0) {
          const agent = agents?.find(a => a.id === policy.resolved_agent_id);
          const payload = {
            event: "policy.submitted",
            policy_number: policy.policy_number || "",
            client_name: policy.client_name || "",
            carrier: policy.carrier || "",
            product: policy.product || "",
            annual_premium: policy.annual_premium || 0,
            agent_email: agent?.email || "",
            application_date: policy.application_date || "",
            status: newStatus,
          };
          for (const config of submittedHooks) {
            await supabase.functions.invoke("fire-webhook", {
              body: { webhook_url: config.webhook_url, payload },
            });
          }
        }
      } catch (e) {
        console.error("Failed to fire policy.submitted webhook", e);
      }
    }

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
        const needsReview = (r as any).needs_review === true;
        const reviewReasons: string[] = (r as any).needs_review_reasons ?? [];
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
            {needsReview && (
              <Badge
                variant="secondary"
                className="text-[10px] bg-yellow-100 text-yellow-800 border border-yellow-300"
                title={reviewReasons.length > 0 ? `Needs review: ${reviewReasons.join(", ")}` : "Needs review"}
              >
                Review
              </Badge>
            )}
          </div>
        );
      },
    },
    { key: "annual_premium", label: "Annual Premium", render: (r) => formatCurrency(r.annual_premium), getValue: (r) => r.annual_premium },
    {
      key: "resolved_agent_id",
      label: "Writing Agent",
      render: (r) =>
        r.resolved_agent_id ? (
          getAgentName(r.resolved_agent_id)
        ) : (
          <Badge
            variant="secondary"
            className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300"
            title={(r as any).agent_number ? `Orphan policy. Add ${(r as any).agent_number} to an agent's contracts to auto-link.` : "Orphan policy."}
          >
            Unassigned
          </Badge>
        ),
    },
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
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Book of Business</h1>
          <div className="flex gap-2 flex-wrap">
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
            {canImport && (
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" /> Import CSV
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setPostDealOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" /> Post a Deal
            </Button>
          </div>
        </div>

        <div className="card-elevated p-3 flex flex-col md:flex-row md:flex-wrap gap-3 md:items-center">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client name..." className="w-full md:w-64" />
          <Select value={statusFilter} onValueChange={handleFilterChange(setStatusFilter)}>
            <SelectTrigger className="w-full md:w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {POLICY_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={bucketFilter} onValueChange={handleFilterChange(setBucketFilter)}>
            <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="All Buckets" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {Object.keys(BUCKET_FILTERS).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={carrier} onValueChange={handleFilterChange(setCarrier)}>
            <SelectTrigger className="w-full md:w-40"><SelectValue placeholder="All Carriers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {carriers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={contractTypeFilter} onValueChange={handleFilterChange(setContractTypeFilter)}>
            <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="All Contracts" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="Direct Pay">Direct Pay</SelectItem>
              <SelectItem value="LOA">LOA</SelectItem>
            </SelectContent>
          </Select>
          {leadSources.length > 0 && (
            <Select value={leadSourceFilter} onValueChange={handleFilterChange(setLeadSourceFilter)}>
              <SelectTrigger className="w-full md:w-40"><SelectValue placeholder="All Sources" /></SelectTrigger>
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
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={needsReviewFilter}
              onCheckedChange={(v) => setNeedsReviewFilter(!!v)}
            />
            <span className="flex items-center gap-1">
              <Badge variant="secondary" className="text-[10px] bg-yellow-100 text-yellow-800 border border-yellow-300 px-1 py-0 h-4">
                Review
              </Badge>
              Needs Review
            </span>
          </label>
          {/* Owner-only orphan filter per Wiki/carrier-ingest-pipeline.md
              (orphan auto-link, 2026-05-02). RLS already hides orphans
              from non-owners; the checkbox is rendered for everyone but
              has no effect for non-owners. */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={unassignedFilter}
              onCheckedChange={(v) => setUnassignedFilter(!!v)}
            />
            <span className="flex items-center gap-1">
              <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-1 py-0 h-4">
                Unassigned
              </Badge>
              Show unassigned only
            </span>
          </label>
        </div>

        {/* Owner-only sticky action bar. Hidden entirely for non-owners
            and when nothing is selected. Renders just above the table so
            it scrolls with the page rather than docking globally. */}
        {isOwnerForBulk && (selectedIds.size > 0 || selectAllMatching) && (
          <div
            className={`rounded-md border px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 ${
              selectAllMatching
                ? "border-destructive/60 bg-destructive/10"
                : "border-primary/40 bg-primary/5"
            }`}
          >
            <div className="flex items-center gap-2 text-sm flex-1 min-w-0">
              <span className="font-semibold text-foreground">
                {selectAllMatching
                  ? `Operating on every policy that matches the current filter (${totalCount}).`
                  : `${selectedIds.size} ${selectedIds.size === 1 ? "policy" : "policies"} selected on this page.`}
              </span>
              {!selectAllMatching && totalCount > visibleIds.length && allVisibleSelected && (
                <button
                  type="button"
                  onClick={() => setSelectAllMatching(true)}
                  className="text-primary underline text-xs whitespace-nowrap"
                >
                  Select all {totalCount} matching the current filter
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedIds(new Set());
                  setSelectAllMatching(false);
                }}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={openDeleteModal}
                disabled={matchingMetaLoading || (!selectAllMatching && selectedIds.size === 0)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {matchingMetaLoading
                  ? "Computing..."
                  : `Delete ${selectAllMatching ? totalCount : selectedIds.size} ${
                      (selectAllMatching ? totalCount : selectedIds.size) === 1 ? "policy" : "policies"
                    }`}
              </Button>
            </div>
          </div>
        )}

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
                    {isOwnerForBulk && (
                      <TableHead className="w-9 px-2">
                        <Checkbox
                          checked={
                            selectAllMatching
                              ? true
                              : allVisibleSelected
                                ? true
                                : someVisibleSelected
                                  ? "indeterminate"
                                  : false
                          }
                          onCheckedChange={(v) => toggleVisible(v === true)}
                          aria-label="Select all visible rows"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableHead>
                    )}
                    <TableHead className="w-8"></TableHead>
                    {columns.map((col) => (
                      <TableHead key={String(col.key)} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10">{col.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPolicies.map((policy) => {
                    const isExpanded = expandedPolicyId === policy.id;
                    const isSelected = selectAllMatching || selectedIds.has(policy.id);
                    return (
                      <React.Fragment key={policy.id}>
                        <TableRow
                          className={`cursor-pointer border-b border-border/50 table-row-hover ${
                            isSelected ? "bg-primary/5" : ""
                          }`}
                          onClick={() => setExpandedPolicyId(isExpanded ? null : policy.id)}
                        >
                          {isOwnerForBulk && (
                            <TableCell className="w-9 px-2" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isSelected}
                                disabled={selectAllMatching}
                                onCheckedChange={(v) => toggleRow(policy.id, v === true)}
                                aria-label={`Select policy ${policy.policy_number || ""}`}
                              />
                            </TableCell>
                          )}
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
                            <TableCell colSpan={columns.length + 1 + (isOwnerForBulk ? 1 : 0)} className="bg-accent/20 p-0">
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
      <BulkDeletePoliciesModal
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        summary={bulkDeleteSummary}
        onDeleted={handleDeleted}
      />
      <PostDealModal open={postDealOpen} onOpenChange={setPostDealOpen} />
      <PolicyImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportComplete={(result: ImportResult) => {
          if (result.flaggedForReview > 0) {
            toast.success(
              `Imported ${result.imported} policies. ${result.flaggedForReview} flagged for review.`,
              {
                action: {
                  label: "View",
                  onClick: () => setNeedsReviewFilter(true),
                },
              }
            );
          } else {
            toast.success(`Imported ${result.imported} policies.`);
          }
          if (result.skipped > 0) {
            toast.info(`${result.skipped} rows skipped.`);
          }
        }}
      />
    </AppLayout>
  );
};

export default BookOfBusiness;
