import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useAgents, Agent } from "@/hooks/useAgents";
import { usePolicies, getPoliciesArray } from "@/hooks/usePolicies";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { subDays, format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Flame,
  Zap,
  Clock,
  XCircle,
  UserX,
  ShieldOff,
} from "lucide-react";

/* ── Badge definitions ─────────────────────────────────────── */
type BadgeKey =
  | "hot_streak"
  | "active"
  | "idle"
  | "dormant"
  | "inactive_login"
  | "not_onboarded";

interface BadgeDef {
  key: BadgeKey;
  label: string;
  icon: React.ElementType;
  dot: string;
  bg: string;
  text: string;
  border: string;
  pillBg: string;
  pillText: string;
  pillBorder: string;
}

const BADGES: BadgeDef[] = [
  {
    key: "hot_streak",
    label: "Hot Streak",
    icon: Flame,
    dot: "bg-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-500/15",
    text: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-500/25",
    pillBg: "bg-emerald-50 dark:bg-emerald-500/10",
    pillText: "text-emerald-700 dark:text-emerald-400",
    pillBorder: "border-emerald-200 dark:border-emerald-500/30",
  },
  {
    key: "active",
    label: "Active",
    icon: Zap,
    dot: "bg-sky-500",
    bg: "bg-sky-50 dark:bg-sky-500/15",
    text: "text-sky-700 dark:text-sky-400",
    border: "border-sky-200 dark:border-sky-500/25",
    pillBg: "bg-sky-50 dark:bg-sky-500/10",
    pillText: "text-sky-700 dark:text-sky-400",
    pillBorder: "border-sky-200 dark:border-sky-500/30",
  },
  {
    key: "idle",
    label: "Idle",
    icon: Clock,
    dot: "bg-amber-500",
    bg: "bg-amber-50 dark:bg-amber-500/15",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-500/25",
    pillBg: "bg-amber-50 dark:bg-amber-500/10",
    pillText: "text-amber-700 dark:text-amber-400",
    pillBorder: "border-amber-200 dark:border-amber-500/30",
  },
  {
    key: "dormant",
    label: "Dormant",
    icon: XCircle,
    dot: "bg-red-500",
    bg: "bg-red-50 dark:bg-red-500/15",
    text: "text-red-600 dark:text-red-400",
    border: "border-red-200 dark:border-red-500/25",
    pillBg: "bg-red-50 dark:bg-red-500/10",
    pillText: "text-red-600 dark:text-red-400",
    pillBorder: "border-red-200 dark:border-red-500/30",
  },
  {
    key: "inactive_login",
    label: "Inactive Login",
    icon: UserX,
    dot: "bg-violet-500",
    bg: "bg-violet-50 dark:bg-violet-500/15",
    text: "text-violet-700 dark:text-violet-400",
    border: "border-violet-200 dark:border-violet-500/25",
    pillBg: "bg-violet-50 dark:bg-violet-500/10",
    pillText: "text-violet-700 dark:text-violet-400",
    pillBorder: "border-violet-200 dark:border-violet-500/30",
  },
  {
    key: "not_onboarded",
    label: "Not Onboarded",
    icon: ShieldOff,
    dot: "bg-slate-400",
    bg: "bg-slate-100 dark:bg-slate-500/15",
    text: "text-slate-600 dark:text-slate-400",
    border: "border-slate-200 dark:border-slate-500/25",
    pillBg: "bg-slate-100 dark:bg-slate-500/10",
    pillText: "text-slate-600 dark:text-slate-400",
    pillBorder: "border-slate-200 dark:border-slate-500/30",
  },
];

const BADGE_MAP = Object.fromEntries(BADGES.map((b) => [b.key, b])) as Record<BadgeKey, BadgeDef>;

/* ── Component ─────────────────────────────────────────────── */
const ActiveAgents = () => {
  const { data: agents, isLoading: agentsLoading, error } = useAgents();

  const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const { data: recentPoliciesRaw, isLoading: recentLoading } = usePolicies({
    dateFrom: thirtyDaysAgo,
  });
  const recentPolicies = getPoliciesArray(recentPoliciesRaw);

  // All-time policies (just to know who has EVER written)
  const { data: allPoliciesRaw, isLoading: allLoading } = usePolicies({});
  const allPolicies = getPoliciesArray(allPoliciesRaw);

  const isLoading = agentsLoading || recentLoading || allLoading;

  const [activeFilter, setActiveFilter] = useState<BadgeKey | null>(null);

  const sevenDaysAgo = subDays(new Date(), 7);
  const thirtyDaysAgoDate = subDays(new Date(), 30);

  /* compute badges per agent */
  const agentBadges = useMemo(() => {
    if (!agents) return new Map<string, BadgeKey[]>();
    const map = new Map<string, BadgeKey[]>();

    const allTimeAgentIds = new Set(allPolicies.map((p) => p.resolved_agent_id).filter(Boolean));
    const recentAgentIds = new Set(recentPolicies.map((p) => p.resolved_agent_id).filter(Boolean));

    // Build per-agent most-recent policy date from recent policies for "hot streak"
    const recentByAgent = new Map<string, Date>();
    for (const p of recentPolicies) {
      if (!p.resolved_agent_id || !p.application_date) continue;
      const d = new Date(p.application_date);
      const existing = recentByAgent.get(p.resolved_agent_id);
      if (!existing || d > existing) recentByAgent.set(p.resolved_agent_id, d);
    }

    for (const agent of agents) {
      const badges: BadgeKey[] = [];

      // Activity badges (mutually exclusive priority)
      const latestDate = recentByAgent.get(agent.id);
      if (latestDate && latestDate >= sevenDaysAgo) {
        badges.push("hot_streak");
      } else if (recentAgentIds.has(agent.id)) {
        badges.push("active");
      } else if (allTimeAgentIds.has(agent.id)) {
        badges.push("idle");
      } else {
        badges.push("dormant");
      }

      // Login badge
      if (agent.auth_user_id) {
        if (!agent.last_login_at || differenceInDays(new Date(), new Date(agent.last_login_at)) > 30) {
          badges.push("inactive_login");
        }
      } else {
        badges.push("not_onboarded");
      }

      map.set(agent.id, badges);
    }
    return map;
  }, [agents, allPolicies, recentPolicies, sevenDaysAgo, thirtyDaysAgoDate]);

  /* summary counts */
  const badgeCounts = useMemo(() => {
    const counts: Record<BadgeKey, number> = {
      hot_streak: 0,
      active: 0,
      idle: 0,
      dormant: 0,
      inactive_login: 0,
      not_onboarded: 0,
    };
    agentBadges.forEach((badges) => {
      for (const b of badges) counts[b]++;
    });
    return counts;
  }, [agentBadges]);

  /* filtered data */
  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    if (!activeFilter) return agents;
    return agents.filter((a) => agentBadges.get(a.id)?.includes(activeFilter));
  }, [agents, activeFilter, agentBadges]);

  const getAgentStats = (agentId: string) => {
    const agentPolicies = recentPolicies.filter((p) => p.resolved_agent_id === agentId);
    const totalPremium = agentPolicies.reduce((s, p) => s + (p.annual_premium || 0), 0);
    return { policyCount: agentPolicies.length, totalPremium };
  };

  const columns: Column<Agent>[] = [
    {
      key: "name",
      label: "Full Name",
      render: (r) => (
        <span className="font-medium text-foreground">{r.first_name} {r.last_name}</span>
      ),
    },
    {
      key: "status_badges",
      label: "Status",
      sortable: false,
      render: (r) => {
        const badges = agentBadges.get(r.id) ?? [];
        return (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((bk) => {
              const def = BADGE_MAP[bk];
              const Icon = def.icon;
              return (
                <span
                  key={bk}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold shadow-sm transition-colors",
                    def.bg,
                    def.text,
                    def.border
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {def.label}
                </span>
              );
            })}
          </div>
        );
      },
    },
    { key: "email", label: "Email" },
    { key: "position", label: "Position" },
    {
      key: "policies_30d",
      label: "Policies (30d)",
      render: (r) => {
        const stats = getAgentStats(r.id);
        return (
          <span className={cn("tabular-nums font-medium", stats.policyCount > 0 ? "text-foreground" : "text-muted-foreground")}>
            {stats.policyCount}
          </span>
        );
      },
      getValue: (r) => getAgentStats(r.id).policyCount,
    },
    {
      key: "premium_30d",
      label: "Premium (30d)",
      render: (r) => {
        const premium = getAgentStats(r.id).totalPremium;
        return (
          <span className={cn("tabular-nums font-medium", premium > 0 ? "text-foreground" : "text-muted-foreground")}>
            {formatCurrency(premium)}
          </span>
        );
      },
      getValue: (r) => getAgentStats(r.id).totalPremium,
    },
    {
      key: "last_login_at",
      label: "Last Login",
      render: (r) =>
        r.last_login_at ? (
          <span className="text-muted-foreground">{formatDate(r.last_login_at)}</span>
        ) : (
          <span className="text-muted-foreground/60">--</span>
        ),
    },
    {
      key: "start_date",
      label: "Start Date",
      render: (r) => <span className="text-muted-foreground">{formatDate(r.start_date)}</span>,
    },
  ];

  if (error)
    return (
      <AppLayout>
        <ErrorBanner message={(error as Error).message} />
      </AppLayout>
    );

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Agent Activity</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              All agents with real-time activity status
            </p>
          </div>
        </div>

        {/* Summary pills */}
        {!isLoading && (
          <div className="flex flex-wrap gap-2">
            {/* "All" pill */}
            <button
              onClick={() => setActiveFilter(null)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                activeFilter === null
                  ? "bg-foreground text-background border-foreground shadow-md"
                  : "bg-card text-muted-foreground border-border hover:bg-muted"
              )}
            >
              All
              <span className="ml-0.5 tabular-nums">{agents?.length ?? 0}</span>
            </button>

            {BADGES.map((def) => {
              const count = badgeCounts[def.key];
              const isActive = activeFilter === def.key;
              const Icon = def.icon;
              return (
                <button
                  key={def.key}
                  onClick={() => setActiveFilter(isActive ? null : def.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                    isActive
                      ? cn(def.bg, def.text, def.border, "shadow-md ring-1 ring-current/10")
                      : cn(def.pillBg, def.pillText, def.pillBorder, "hover:shadow-sm")
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {def.label}
                  <span className="ml-0.5 tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <SkeletonTable columns={8} />
        ) : filteredAgents.length === 0 ? (
          <EmptyState
            title="No agents found"
            description={
              activeFilter
                ? `No agents match the "${BADGE_MAP[activeFilter].label}" filter.`
                : "No agents in your organization yet."
            }
          />
        ) : (
          <DataTable columns={columns} data={filteredAgents} pageSize={25} exportFilename="agent-activity" />
        )}
      </div>
    </AppLayout>
  );
};

export default ActiveAgents;
