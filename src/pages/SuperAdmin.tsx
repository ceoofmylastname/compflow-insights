import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { usePlatformTenants, TenantSummary } from "@/hooks/usePlatformData";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Building2,
  Users,
  DollarSign,
  CreditCard,
  Search,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe,
  Webhook,
  Calendar,
} from "lucide-react";
import { format, differenceInDays, subDays } from "date-fns";
import CFLogo from "@/components/CFLogo";
import { cn } from "@/lib/utils";

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    Starter: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-500/25",
    Growth: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/25",
    Agency: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-400 dark:border-violet-500/25",
    Trial: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/25",
    Free: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold", colors[plan] || colors.Free)}>
      {plan}
    </span>
  );
}

function StatusIndicator({ plan }: { plan: string }) {
  if (plan === "Trial") {
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Trialing</span>;
  }
  if (plan === "Expired" || plan === "Cancelled") {
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />{plan}</span>;
  }
  return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Active</span>;
}

export default function SuperAdmin() {
  const navigate = useNavigate();
  const { isSuperAdmin, isLoading: authLoading } = useSuperAdmin();
  const { data: tenants, isLoading } = usePlatformTenants();

  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) navigate("/dashboard", { replace: true });
  }, [authLoading, isSuperAdmin, navigate]);

  const filtered = useMemo(() => {
    if (!tenants) return [];
    let rows = tenants;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (t) =>
          (t.agency_name ?? "").toLowerCase().includes(q) ||
          t.owner_name.toLowerCase().includes(q) ||
          t.owner_email.toLowerCase().includes(q)
      );
    }
    if (planFilter !== "all") {
      rows = rows.filter((t) => t.plan === planFilter);
    }
    return rows;
  }, [tenants, search, planFilter]);

  const stats = useMemo(() => {
    if (!tenants) return { total: 0, active: 0, agents: 0, premium: 0 };
    return {
      total: tenants.length,
      active: tenants.filter((t) => t.plan && t.plan !== "Free" && t.plan !== "Expired" && t.plan !== "Cancelled").length,
      agents: tenants.reduce((s, t) => s + t.total_agents, 0),
      premium: tenants.reduce((s, t) => s + t.total_premium, 0),
    };
  }, [tenants]);

  const oneWeekAgo = subDays(new Date(), 7).toISOString();

  if (authLoading || (!isSuperAdmin && !authLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <CFLogo size="md" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Platform Admin</h1>
            <p className="text-sm text-muted-foreground">All active SaaS accounts across the platform.</p>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Tenants", value: stats.total, icon: Building2 },
            { label: "Active Subscriptions", value: stats.active, icon: CreditCard },
            { label: "Total Agents", value: stats.agents, icon: Users },
            { label: "Platform Premium", value: formatCurrency(stats.premium), icon: DollarSign },
          ].map((s) => (
            <Card key={s.label} className="border border-border shadow-[var(--shadow-sm)]">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search agency, owner, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Plans" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              <SelectItem value="Free">Free</SelectItem>
              <SelectItem value="Starter">Starter</SelectItem>
              <SelectItem value="Growth">Growth</SelectItem>
              <SelectItem value="Agency">Agency</SelectItem>
              <SelectItem value="Trial">Trial</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card className="border border-border shadow-[var(--shadow-sm)]">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Agency</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Agents</TableHead>
                  <TableHead className="text-right">Active (30d)</TableHead>
                  <TableHead className="text-right">Policies</TableHead>
                  <TableHead className="text-right">Premium</TableHead>
                  <TableHead>Signed Up</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-12">
                      No tenants found.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((t) => {
                  const isNew = t.created_at >= oneWeekAgo;
                  const isExpired = t.plan === "Expired" || t.plan === "Cancelled";
                  return (
                    <Collapsible key={t.tenant_id} asChild open={expandedId === t.tenant_id} onOpenChange={(open) => setExpandedId(open ? t.tenant_id : null)}>
                      <>
                        <CollapsibleTrigger asChild>
                          <TableRow
                            className={cn(
                              "cursor-pointer transition-colors",
                              isNew && "border-l-2 border-l-emerald-500",
                              isExpired && "opacity-60"
                            )}
                          >
                            <TableCell className="w-8">
                              {expandedId === t.tenant_id ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell className="font-medium text-foreground">{t.agency_name || t.tenant_name}</TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm text-foreground">{t.owner_name}</p>
                                <p className="text-xs text-muted-foreground">{t.owner_email}</p>
                              </div>
                            </TableCell>
                            <TableCell><PlanBadge plan={t.plan} /></TableCell>
                            <TableCell><StatusIndicator plan={t.plan} /></TableCell>
                            <TableCell className="text-right font-medium">{t.total_agents}</TableCell>
                            <TableCell className="text-right font-medium">{t.active_agents_30d}</TableCell>
                            <TableCell className="text-right font-medium">{t.total_policies}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(t.total_premium)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {format(new Date(t.created_at), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/super-admin/tenant/${t.tenant_id}`);
                                }}
                              >
                                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                Details
                              </Button>
                            </TableCell>
                          </TableRow>
                        </CollapsibleTrigger>
                        <CollapsibleContent asChild>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={11}>
                              <ExpandedDetails tenant={t} />
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

function ExpandedDetails({ tenant: t }: { tenant: TenantSummary }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4 px-2">
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subscription</h4>
        <div className="space-y-1 text-sm">
          <p><span className="text-muted-foreground">Plan:</span> <PlanBadge plan={t.plan} /></p>
          <p><span className="text-muted-foreground">Agents:</span> {t.total_agents} total, {t.active_agents_30d} active</p>
        </div>
      </div>
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity</h4>
        <div className="space-y-1 text-sm">
          <p className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Last import:</span>{" "}
            {t.last_policy_date ? format(new Date(t.last_policy_date), "MMM d, yyyy") : "Never"}
          </p>
          <p className="flex items-center gap-1.5">
            <Webhook className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Webhooks:</span> {t.webhook_count} active
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Domain</h4>
        <div className="space-y-1 text-sm">
          {t.custom_domain ? (
            <p className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              {t.custom_domain} {t.domain_verified ? <Badge variant="outline" className="text-[10px]">Verified</Badge> : <Badge variant="destructive" className="text-[10px]">Unverified</Badge>}
            </p>
          ) : t.subdomain ? (
            <p className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              {t.subdomain}.baseshophq.com
            </p>
          ) : (
            <p className="text-muted-foreground">No custom domain</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanBadgeInline({ plan }: { plan: string }) {
  return <PlanBadge plan={plan} />;
}
