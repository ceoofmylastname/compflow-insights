/**
 * Home page data layer per Wiki/home-page-and-announcements.md.
 *
 * Each hook returns a permission-scoped slice for the current user:
 *   - useUserActionItems     : per-user banner row (own items only)
 *   - useLeadershipBroadcasts: tenant-wide flyer slot, client-side
 *                              targeting filter applied
 *   - usePromotionDistance   : owner-configured criteria + the current
 *                              user's production over the relevant window
 *   - useHomeLeaderboards    : 3 tabs, agency-wide aggregate (Scoreboard
 *                              carve-out per hierarchy-permissions-model.md)
 *   - useRecentActivity      : view-down feed (self + downline) of the
 *                              last 20 events
 */

import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useAgents } from "@/hooks/useAgents";
import { computeDownlineAgentIds } from "@/lib/downline";
import { toast } from "sonner";
import { startOfMonth, subMonths, formatISO, parseISO } from "date-fns";

/* ------------------------------------------------------------------ */
/*  user_action_items                                                  */
/* ------------------------------------------------------------------ */

export interface UserActionItem {
  id: string;
  tenant_id: string;
  user_id: string;
  action_type: string;
  title: string;
  body: string | null;
  cta_text: string | null;
  cta_url: string | null;
  is_dismissible: boolean;
  auto_resolve_condition: string | null;
  dismissed_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

/**
 * Lazy auto-resolve. When the home page reads action items, each open
 * row's auto_resolve_condition is checked against the current data; if
 * satisfied, resolved_at is stamped and the banner disappears next
 * render. Server-side triggers can replace this when the platform has
 * more robust event sourcing — for now this keeps the UX promise
 * (banner vanishes the moment the underlying condition is satisfied)
 * without a heavier infrastructure investment.
 *
 * Recognized conditions:
 *   has_writing_number        -> any agent_contracts row exists for the user
 *   has_npn                   -> agents.npn is non-empty
 *   complete_profile          -> agents.first_name + last_name + phone present
 */
async function evaluateAutoResolveConditions(items: UserActionItem[], agentId: string) {
  const open = items.filter((it) => !it.resolved_at && !it.dismissed_at && it.auto_resolve_condition);
  if (open.length === 0) return;

  // Pre-fetch the data each condition might need; keep network calls
  // proportional to which conditions are actually present.
  const conditions = new Set(open.map((it) => it.auto_resolve_condition!));
  const checks: Record<string, () => Promise<boolean>> = {
    has_writing_number: async () => {
      const { count } = await supabase
        .from("agent_contracts")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agentId);
      return (count ?? 0) > 0;
    },
    has_npn: async () => {
      const { data } = await supabase.from("agents").select("npn").eq("id", agentId).maybeSingle();
      return !!(data as { npn: string | null } | null)?.npn?.trim();
    },
    complete_profile: async () => {
      const { data } = await supabase
        .from("agents")
        .select("first_name, last_name, phone")
        .eq("id", agentId)
        .maybeSingle();
      const a = data as { first_name: string | null; last_name: string | null; phone: string | null } | null;
      return !!(a?.first_name?.trim() && a?.last_name?.trim() && a?.phone?.trim());
    },
  };

  const resolved = new Set<string>();
  for (const cond of conditions) {
    const fn = checks[cond];
    if (!fn) continue;
    if (await fn()) resolved.add(cond);
  }
  if (resolved.size === 0) return;

  const idsToResolve = open
    .filter((it) => resolved.has(it.auto_resolve_condition!))
    .map((it) => it.id);
  if (idsToResolve.length === 0) return;
  await supabase
    .from("user_action_items")
    .update({ resolved_at: new Date().toISOString() } as any)
    .in("id", idsToResolve);
}

export function useUserActionItems() {
  const { data: currentAgent } = useCurrentAgent();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["userActionItems", currentAgent?.id],
    queryFn: async (): Promise<UserActionItem[]> => {
      if (!currentAgent) return [];
      const { data, error } = await supabase
        .from("user_action_items")
        .select("*")
        .eq("user_id", currentAgent.id)
        .is("resolved_at", null)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as UserActionItem[];
    },
    enabled: !!currentAgent,
    staleTime: 30 * 1000,
  });

  // Auto-resolve sweep on each fresh fetch.
  useEffect(() => {
    if (!query.data || !currentAgent) return;
    evaluateAutoResolveConditions(query.data, currentAgent.id).then(() => {
      queryClient.invalidateQueries({ queryKey: ["userActionItems", currentAgent.id] });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, currentAgent?.id]);

  return query;
}

export function useDismissActionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("user_action_items")
        .update({ dismissed_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userActionItems"] });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  leadership_broadcasts                                              */
/* ------------------------------------------------------------------ */

export interface LeadershipBroadcast {
  id: string;
  tenant_id: string;
  created_by_user_id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
  targeting: { all?: boolean; positions?: string[] };
  start_at: string;
  end_at: string | null;
  is_active: boolean;
  created_at: string;
}

export function useLeadershipBroadcasts() {
  const { data: currentAgent } = useCurrentAgent();
  return useQuery({
    queryKey: ["leadershipBroadcasts", currentAgent?.tenant_id, currentAgent?.position_id],
    queryFn: async (): Promise<LeadershipBroadcast[]> => {
      if (!currentAgent) return [];
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("leadership_broadcasts")
        .select("*")
        .eq("tenant_id", currentAgent.tenant_id)
        .eq("is_active", true)
        .lte("start_at", now)
        .order("start_at", { ascending: false });
      if (error) throw error;

      const all = (data ?? []) as unknown as LeadershipBroadcast[];

      // Apply end_at + targeting client-side. RLS already gated the read
      // to tenant members; this layer narrows by audience.
      return all.filter((b) => {
        if (b.end_at && new Date(b.end_at) < new Date()) return false;
        const t = b.targeting ?? { all: true };
        if (t.all) return true;
        if (Array.isArray(t.positions) && currentAgent.position_id) {
          return t.positions.includes(currentAgent.position_id);
        }
        return false;
      });
    },
    enabled: !!currentAgent,
    staleTime: 60 * 1000,
  });
}

export function useCreateBroadcast() {
  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();

  return useMutation({
    mutationFn: async (params: {
      title: string;
      body?: string;
      image_url?: string;
      cta_text?: string;
      cta_url?: string;
      targeting?: LeadershipBroadcast["targeting"];
      start_at?: string;
      end_at?: string | null;
    }) => {
      if (!currentAgent) throw new Error("Not authenticated");
      const { error } = await supabase.from("leadership_broadcasts").insert({
        tenant_id: currentAgent.tenant_id,
        created_by_user_id: currentAgent.id,
        title: params.title,
        body: params.body ?? null,
        image_url: params.image_url ?? null,
        cta_text: params.cta_text ?? null,
        cta_url: params.cta_url ?? null,
        targeting: params.targeting ?? { all: true },
        start_at: params.start_at ?? new Date().toISOString(),
        end_at: params.end_at ?? null,
        is_active: true,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadershipBroadcasts"] });
      toast.success("Broadcast posted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeactivateBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("leadership_broadcasts")
        .update({ is_active: false } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadershipBroadcasts"] });
      toast.success("Broadcast removed");
    },
  });
}

/* ------------------------------------------------------------------ */
/*  promotion_targets + distance calculator                            */
/* ------------------------------------------------------------------ */

export interface PromotionTarget {
  id: string;
  tenant_id: string;
  from_position_id: string;
  to_position_id: string;
  criteria: {
    min_premium_last_3_months?: number;
    min_premium_mtd?: number;
    min_active_downline_count?: number;
    min_recruits_last_3_months?: number;
  };
}

export interface PromotionDistance {
  /** Current position title. */
  fromPosition: string | null;
  /** Next position title. */
  toPosition: string | null;
  /** Per-criterion progress rows for the UI. */
  criteria: Array<{
    label: string;
    current: number;
    target: number;
    unit: "currency" | "count";
    pct: number;
  }>;
  /** Overall progress percentage (min of all criteria). */
  overallPct: number;
}

export function usePromotionDistance(): PromotionDistance | null {
  const { data: currentAgent } = useCurrentAgent();
  const { data: agents } = useAgents();

  const { data } = useQuery({
    queryKey: ["promotionDistance", currentAgent?.id],
    queryFn: async (): Promise<PromotionDistance | null> => {
      if (!currentAgent?.position_id || !currentAgent.tenant_id) return null;

      // Lookup the target row defined for the user's current position.
      const { data: targetRow } = await supabase
        .from("promotion_targets")
        .select("*")
        .eq("tenant_id", currentAgent.tenant_id)
        .eq("from_position_id", currentAgent.position_id)
        .maybeSingle();

      if (!targetRow) return null;
      const target = targetRow as unknown as PromotionTarget;

      // Resolve target position title.
      const { data: posRow } = await supabase
        .from("positions")
        .select("title")
        .eq("id", target.to_position_id)
        .maybeSingle();
      const toTitle = (posRow as { title: string } | null)?.title ?? null;

      const last3MonthStart = formatISO(startOfMonth(subMonths(new Date(), 2)), { representation: "date" });
      const mtdStart = formatISO(startOfMonth(new Date()), { representation: "date" });

      // Premium last 3 months (Booked + Realized; deprecated Active alias included).
      let premium3mo = 0;
      if (target.criteria.min_premium_last_3_months != null) {
        const { data: rows } = await supabase
          .from("policies")
          .select("annual_premium")
          .eq("tenant_id", currentAgent.tenant_id)
          .eq("resolved_agent_id", currentAgent.id)
          .in("status", ["Issued", "Issue Paid", "Active"])
          .gte("application_date", last3MonthStart);
        premium3mo = (rows ?? []).reduce((s, r: any) => s + (r.annual_premium || 0), 0);
      }

      // Premium MTD.
      let premiumMtd = 0;
      if (target.criteria.min_premium_mtd != null) {
        const { data: rows } = await supabase
          .from("policies")
          .select("annual_premium")
          .eq("tenant_id", currentAgent.tenant_id)
          .eq("resolved_agent_id", currentAgent.id)
          .in("status", ["Issued", "Issue Paid", "Active"])
          .gte("application_date", mtdStart);
        premiumMtd = (rows ?? []).reduce((s, r: any) => s + (r.annual_premium || 0), 0);
      }

      // Downline metrics derived from the agents list (already permission-scoped by RLS).
      const list = agents ?? [];
      const downlineIds = computeDownlineAgentIds(currentAgent.email, list);
      let activeDownlineCount = 0;
      if (target.criteria.min_active_downline_count != null && downlineIds.size > 0) {
        const since = formatISO(subMonths(new Date(), 1), { representation: "date" });
        const { data: actRows } = await supabase
          .from("policies")
          .select("resolved_agent_id")
          .eq("tenant_id", currentAgent.tenant_id)
          .gte("application_date", since)
          .in("resolved_agent_id", Array.from(downlineIds));
        const activeSet = new Set((actRows ?? []).map((r: any) => r.resolved_agent_id).filter(Boolean));
        activeDownlineCount = activeSet.size;
      }

      let recruits3mo = 0;
      if (target.criteria.min_recruits_last_3_months != null) {
        const cutoff = subMonths(new Date(), 3);
        recruits3mo = list.filter(
          (a) =>
            a.upline_email === currentAgent.email &&
            a.start_date &&
            parseISO(a.start_date) >= cutoff
        ).length;
      }

      const criteria: PromotionDistance["criteria"] = [];
      const push = (label: string, current: number, target: number, unit: "currency" | "count") => {
        criteria.push({
          label,
          current,
          target,
          unit,
          pct: target > 0 ? Math.min(100, (current / target) * 100) : 100,
        });
      };
      if (target.criteria.min_premium_last_3_months != null) {
        push("Premium last 3 months", premium3mo, target.criteria.min_premium_last_3_months, "currency");
      }
      if (target.criteria.min_premium_mtd != null) {
        push("Premium MTD", premiumMtd, target.criteria.min_premium_mtd, "currency");
      }
      if (target.criteria.min_active_downline_count != null) {
        push("Active downline agents", activeDownlineCount, target.criteria.min_active_downline_count, "count");
      }
      if (target.criteria.min_recruits_last_3_months != null) {
        push("Recruits last 3 months", recruits3mo, target.criteria.min_recruits_last_3_months, "count");
      }

      const overallPct = criteria.length > 0 ? Math.min(...criteria.map((c) => c.pct)) : 0;

      return {
        fromPosition: currentAgent.position ?? null,
        toPosition: toTitle,
        criteria,
        overallPct,
      };
    },
    enabled: !!currentAgent?.position_id && !!agents,
    staleTime: 60 * 1000,
  });

  return data ?? null;
}

/* ------------------------------------------------------------------ */
/*  Home leaderboards                                                  */
/* ------------------------------------------------------------------ */

export interface LeaderboardRow {
  agentId: string;
  name: string;
  position: string | null;
  amount: number;
}

export type LeaderboardTab = "producers" | "recruiters" | "improved";

export function useHomeLeaderboards(tab: LeaderboardTab) {
  const { data: currentAgent } = useCurrentAgent();
  const { data: agents } = useAgents();

  return useQuery({
    queryKey: ["homeLeaderboards", currentAgent?.tenant_id, tab],
    queryFn: async (): Promise<LeaderboardRow[]> => {
      if (!currentAgent || !agents) return [];

      // Top Producers: rank by Booked + Realized premium MTD.
      if (tab === "producers") {
        const since = formatISO(startOfMonth(new Date()), { representation: "date" });
        const { data: rows } = await supabase
          .from("policies")
          .select("resolved_agent_id, annual_premium")
          .eq("tenant_id", currentAgent.tenant_id)
          .in("status", ["Issued", "Issue Paid", "Active"])
          .gte("application_date", since);
        const map = new Map<string, number>();
        for (const r of (rows ?? []) as any[]) {
          if (!r.resolved_agent_id) continue;
          map.set(r.resolved_agent_id, (map.get(r.resolved_agent_id) ?? 0) + (r.annual_premium || 0));
        }
        return buildRows(map, agents);
      }

      // Top Recruiters: count of agents added in MTD where upline_email
      // points at the recruiter.
      if (tab === "recruiters") {
        const since = startOfMonth(new Date());
        const map = new Map<string, number>();
        for (const a of agents) {
          if (!a.upline_email || !a.start_date) continue;
          if (parseISO(a.start_date) < since) continue;
          // Find the recruiter agent_id from email.
          const recruiter = agents.find((x) => x.email === a.upline_email);
          if (!recruiter) continue;
          map.set(recruiter.id, (map.get(recruiter.id) ?? 0) + 1);
        }
        return buildRows(map, agents);
      }

      // Most Improved: delta of Booked+Realized premium current vs prior period.
      if (tab === "improved") {
        const thisStart = formatISO(startOfMonth(new Date()), { representation: "date" });
        const lastStart = formatISO(startOfMonth(subMonths(new Date(), 1)), { representation: "date" });
        const [{ data: thisRows }, { data: lastRows }] = await Promise.all([
          supabase
            .from("policies")
            .select("resolved_agent_id, annual_premium")
            .eq("tenant_id", currentAgent.tenant_id)
            .in("status", ["Issued", "Issue Paid", "Active"])
            .gte("application_date", thisStart),
          supabase
            .from("policies")
            .select("resolved_agent_id, annual_premium")
            .eq("tenant_id", currentAgent.tenant_id)
            .in("status", ["Issued", "Issue Paid", "Active"])
            .gte("application_date", lastStart)
            .lt("application_date", thisStart),
        ]);
        const sum = (rows: any[] | null | undefined) => {
          const m = new Map<string, number>();
          for (const r of rows ?? []) {
            if (!r.resolved_agent_id) continue;
            m.set(r.resolved_agent_id, (m.get(r.resolved_agent_id) ?? 0) + (r.annual_premium || 0));
          }
          return m;
        };
        const thisMap = sum(thisRows as any[]);
        const lastMap = sum(lastRows as any[]);
        const delta = new Map<string, number>();
        const allIds = new Set([...thisMap.keys(), ...lastMap.keys()]);
        for (const id of allIds) {
          delta.set(id, (thisMap.get(id) ?? 0) - (lastMap.get(id) ?? 0));
        }
        return buildRows(delta, agents);
      }

      return [];
    },
    enabled: !!currentAgent && !!agents,
    staleTime: 60 * 1000,
  });
}

function buildRows(
  map: Map<string, number>,
  agents: Array<{ id: string; first_name: string; last_name: string; position?: string | null }>
): LeaderboardRow[] {
  return Array.from(map.entries())
    .map(([id, amount]) => {
      const a = agents.find((x) => x.id === id);
      return {
        agentId: id,
        name: a ? `${a.first_name} ${a.last_name}`.trim() : "Unknown",
        position: a?.position ?? null,
        amount,
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
}

/* ------------------------------------------------------------------ */
/*  Recent activity feed                                               */
/* ------------------------------------------------------------------ */

export interface ActivityEvent {
  id: string;
  kind: "policy_submitted" | "policy_issued" | "policy_issue_paid" | "agent_added";
  at: string;
  who: string;
  detail: string;
}

export function useRecentActivity(limit = 20) {
  const { data: currentAgent } = useCurrentAgent();
  const { data: agents } = useAgents();

  return useQuery({
    queryKey: ["recentActivity", currentAgent?.id, limit],
    queryFn: async (): Promise<ActivityEvent[]> => {
      if (!currentAgent || !agents) return [];

      // Permission scope: owner sees all tenant agents; everyone else
      // sees self + downline.
      const inScopeIds = currentAgent.is_owner
        ? new Set(agents.map((a) => a.id))
        : (() => {
            const ids = computeDownlineAgentIds(currentAgent.email, agents);
            ids.add(currentAgent.id);
            return ids;
          })();

      // Pull the last N policies + the last N joined agents in scope.
      const [{ data: policyRows }, { data: agentRows }] = await Promise.all([
        supabase
          .from("policies")
          .select("id, status, carrier, annual_premium, resolved_agent_id, updated_at, created_at")
          .eq("tenant_id", currentAgent.tenant_id)
          .neq("status", "Draft")
          .order("updated_at", { ascending: false })
          .limit(limit),
        supabase
          .from("agents")
          .select("id, first_name, last_name, upline_email, start_date, created_at")
          .eq("tenant_id", currentAgent.tenant_id)
          .order("created_at", { ascending: false })
          .limit(limit),
      ]);

      const events: ActivityEvent[] = [];

      const nameOf = (id: string | null | undefined) => {
        if (!id) return "Someone";
        const a = agents.find((x) => x.id === id);
        return a ? `${a.first_name} ${a.last_name}`.trim() : "Someone";
      };

      for (const p of (policyRows ?? []) as any[]) {
        if (!inScopeIds.has(p.resolved_agent_id)) continue;
        let kind: ActivityEvent["kind"];
        switch (p.status) {
          case "Issue Paid": kind = "policy_issue_paid"; break;
          case "Issued":
          case "Active":    kind = "policy_issued"; break;
          case "Submitted": kind = "policy_submitted"; break;
          default: continue;
        }
        events.push({
          id: `policy:${p.id}:${p.status}`,
          kind,
          at: p.updated_at ?? p.created_at,
          who: nameOf(p.resolved_agent_id),
          detail: `${p.carrier || "Carrier"} · $${Number(p.annual_premium || 0).toLocaleString()}`,
        });
      }

      for (const a of (agentRows ?? []) as any[]) {
        if (!inScopeIds.has(a.id)) continue;
        events.push({
          id: `agent:${a.id}`,
          kind: "agent_added",
          at: a.created_at,
          who: `${a.first_name} ${a.last_name}`.trim(),
          detail: a.upline_email ? `Joined under ${a.upline_email}` : "Joined the team",
        });
      }

      return events
        .sort((x, y) => (x.at < y.at ? 1 : -1))
        .slice(0, limit);
    },
    enabled: !!currentAgent && !!agents,
    staleTime: 30 * 1000,
  });
}

/* ------------------------------------------------------------------ */
/*  Manager check (used by composer gating)                            */
/* ------------------------------------------------------------------ */

export function useIsOwnerOrManager(): boolean {
  const { data: currentAgent } = useCurrentAgent();
  const { data: agents } = useAgents();
  return useMemo(() => {
    if (!currentAgent) return false;
    if (currentAgent.is_owner) return true;
    if (!agents) return false;
    return agents.some((a) => a.upline_email === currentAgent.email);
  }, [currentAgent, agents]);
}
