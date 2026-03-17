import { useState, useMemo, useCallback, useRef, useEffect, memo } from "react";
import type { Agent } from "@/hooks/useAgents";
import { usePolicies, getPoliciesArray } from "@/hooks/usePolicies";
import { useCommissionPayouts } from "@/hooks/useCommissionPayouts";
import { formatCurrency } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OrgTreeProps {
  agents: Agent[];
  currentAgentEmail: string;
  onSelectAgent: (agent: Agent) => void;
  searchQuery: string;
}

interface TreeNode {
  agent: Agent;
  children: TreeNode[];
}

interface AgentStats {
  activePrem: number;
  commYTD: number;
  directReports: number;
}

const DEFAULT_STATS: AgentStats = { activePrem: 0, commYTD: 0, directReports: 0 };

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

/** Deterministic HSL color pair from position string (border + avatar bg). */
function getPositionColors(position: string | null): { solid: string; light: string } {
  if (!position) return { solid: "hsl(0 0% 65%)", light: "hsl(0 0% 65% / 0.12)" };
  let hash = 0;
  for (let i = 0; i < position.length; i++) {
    hash = position.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return {
    solid: `hsl(${hue} 55% 48%)`,
    light: `hsl(${hue} 55% 48% / 0.12)`,
  };
}

/** Build tree from flat agents array. O(n). */
function buildTree(agents: Agent[], rootEmail: string): TreeNode | null {
  const root = agents.find((a) => a.email === rootEmail);
  if (!root) return null;

  const byUpline = new Map<string, Agent[]>();
  for (const a of agents) {
    if (!a.upline_email) continue;
    const list = byUpline.get(a.upline_email) ?? [];
    list.push(a);
    byUpline.set(a.upline_email, list);
  }

  function build(agent: Agent): TreeNode {
    const children = (byUpline.get(agent.email) ?? []).sort((a, b) =>
      a.last_name.localeCompare(b.last_name)
    );
    return { agent, children: children.map(build) };
  }

  return build(root);
}

/** Collect every agent ID in a subtree. */
function collectIds(node: TreeNode): string[] {
  return [node.agent.id, ...node.children.flatMap(collectIds)];
}

/** Pre-order search for first matching ID. */
function findFirstMatch(node: TreeNode, ids: Set<string>): string | null {
  if (ids.has(node.agent.id)) return node.agent.id;
  for (const child of node.children) {
    const found = findFirstMatch(child, ids);
    if (found) return found;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Shared render context (avoids prop-drilling through recursion)     */
/* ------------------------------------------------------------------ */

interface TreeRenderCtx {
  expandedSet: Set<string>;
  highlightedIds: Set<string>;
  statsMap: Map<string, AgentStats>;
  onSelect: (agent: Agent) => void;
  onToggle: (id: string) => void;
  firstMatchId: string | null;
  firstMatchRef: React.MutableRefObject<HTMLDivElement | null>;
}

/* ------------------------------------------------------------------ */
/*  NodeCard (memoised)                                                */
/* ------------------------------------------------------------------ */

interface NodeCardProps {
  agent: Agent;
  childCount: number;
  stats: AgentStats;
  isExpanded: boolean;
  isHighlighted: boolean;
  isRoot?: boolean;
  onSelect: (agent: Agent) => void;
  onToggle: (id: string) => void;
}

const NodeCard = memo(function NodeCard({
  agent,
  childCount,
  stats,
  isExpanded,
  isHighlighted,
  isRoot,
  onSelect,
  onToggle,
}: NodeCardProps) {
  const initials = `${(agent.first_name || "?")[0]}${(agent.last_name || "?")[0]}`.toUpperCase();
  const colors = getPositionColors(agent.position);

  return (
    <div
      className={cn(
        "w-52 rounded-lg border bg-card shadow-sm cursor-pointer transition-all hover:shadow-md select-none",
        isRoot ? "border-primary/40" : "border-border",
        isHighlighted && "ring-2 ring-yellow-400 ring-offset-2 ring-offset-background"
      )}
      style={{ borderLeftWidth: 4, borderLeftColor: colors.solid }}
      onClick={() => onSelect(agent)}
    >
      <div className="p-3">
        {/* Avatar + name + position */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ backgroundColor: colors.light, color: colors.solid }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">
              {agent.first_name} {agent.last_name}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {agent.position || "Agent"}
            </p>
          </div>
        </div>

        {/* Contract type badge */}
        {agent.contract_type && (
          <div className="mt-2">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {agent.contract_type}
            </Badge>
          </div>
        )}

        {/* Quick stats */}
        <div className="mt-2 grid grid-cols-3 gap-1 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground leading-tight">Premium</p>
            <p className="text-[11px] font-semibold text-foreground">
              {formatCurrency(stats.activePrem)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground leading-tight">Comm.</p>
            <p className="text-[11px] font-semibold text-foreground">
              {formatCurrency(stats.commYTD)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground leading-tight">Reports</p>
            <p className="text-[11px] font-semibold text-foreground">{stats.directReports}</p>
          </div>
        </div>
      </div>

      {/* Expand / collapse toggle */}
      {childCount > 0 && (
        <button
          className="flex items-center justify-center gap-1 w-full border-t border-border py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors rounded-b-lg"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(agent.id);
          }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {childCount} report{childCount !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  Recursive tree rendering                                           */
/* ------------------------------------------------------------------ */

/** Renders a single node + its expanded subtree. */
function RenderNode({
  node,
  ctx,
  isRoot,
}: {
  node: TreeNode;
  ctx: TreeRenderCtx;
  isRoot?: boolean;
}) {
  const isExpanded = ctx.expandedSet.has(node.agent.id);
  const stats = ctx.statsMap.get(node.agent.id) ?? DEFAULT_STATS;
  const isFirstMatch = node.agent.id === ctx.firstMatchId;

  return (
    <div
      className="flex flex-col items-center"
      ref={isFirstMatch ? ctx.firstMatchRef : undefined}
    >
      <NodeCard
        agent={node.agent}
        childCount={node.children.length}
        stats={stats}
        isExpanded={isExpanded}
        isHighlighted={ctx.highlightedIds.has(node.agent.id)}
        isRoot={isRoot}
        onSelect={ctx.onSelect}
        onToggle={ctx.onToggle}
      />

      {/* Expanded children */}
      {isExpanded && node.children.length > 0 && (
        <div className="flex flex-col items-center">
          {/* Vertical line from parent card to children row */}
          <div className="w-px h-5 bg-border" />
          <RenderChildren nodes={node.children} ctx={ctx} />
        </div>
      )}
    </div>
  );
}

/**
 * Renders a row of sibling nodes with horizontal + vertical connector lines.
 *
 * Layout per child wrapper (no gap between siblings):
 *   ┌──────────────────────┐
 *   │ ←left─ ─ ─│──right→ │   (h-px lines at top-0)
 *   │           │          │   (w-px vertical from top to h-5)
 *   │        [card]        │
 *   │       [subtree]      │
 *   └──────────────────────┘
 *
 * Adjacent left+right segments meet at the boundary → continuous bar.
 */
function RenderChildren({ nodes, ctx }: { nodes: TreeNode[]; ctx: TreeRenderCtx }) {
  const count = nodes.length;

  return (
    <div className="flex items-start">
      {nodes.map((node, i) => {
        const isFirst = i === 0;
        const isLast = i === count - 1;
        const isOnly = count === 1;

        return (
          <div
            key={node.agent.id}
            className="flex flex-col items-center relative pt-5 px-4"
          >
            {/* Vertical connector from horizontal bar down to card */}
            <div className="absolute top-0 left-1/2 -translate-x-px w-px h-5 bg-border" />

            {/* Horizontal connector segments */}
            {!isOnly && !isLast && (
              <div className="absolute top-0 left-1/2 right-0 h-px bg-border" />
            )}
            {!isOnly && !isFirst && (
              <div className="absolute top-0 left-0 right-1/2 h-px bg-border" />
            )}

            <RenderNode node={node} ctx={ctx} />
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main OrgTree component                                             */
/* ------------------------------------------------------------------ */

export function OrgTree({
  agents,
  currentAgentEmail,
  onSelectAgent,
  searchQuery,
}: OrgTreeProps) {
  /* ---------- tree structure (rebuilt only when agents change) ---------- */
  const rootNode = useMemo(
    () => buildTree(agents, currentAgentEmail),
    [agents, currentAgentEmail]
  );

  /* ---------- expand / collapse state ---------- */
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => {
    if (!rootNode) return new Set<string>();
    return new Set([rootNode.agent.id]);
  });

  // Keep root expanded when agent data refreshes
  useEffect(() => {
    if (rootNode) {
      setExpandedSet((prev) => {
        if (prev.has(rootNode.agent.id)) return prev;
        return new Set([...prev, rootNode.agent.id]);
      });
    }
  }, [rootNode]);

  const toggleNode = useCallback((id: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!rootNode) return;
    setExpandedSet(new Set(collectIds(rootNode)));
  }, [rootNode]);

  const collapseAll = useCallback(() => {
    if (!rootNode) return;
    setExpandedSet(new Set([rootNode.agent.id]));
  }, [rootNode]);

  /* ---------- stats (shares React Query cache with AgentRoster) ---------- */
  const { data: policiesRaw } = usePolicies({ status: ["Active"] });
  const activePolicies = getPoliciesArray(policiesRaw);
  const { data: payouts } = useCommissionPayouts({
    dateFrom: `${new Date().getFullYear()}-01-01T00:00:00Z`,
  });

  const statsMap = useMemo(() => {
    const map = new Map<string, AgentStats>();
    for (const a of agents) {
      const activePrem = activePolicies
        .filter((p) => p.resolved_agent_id === a.id)
        .reduce((s, p) => s + (p.annual_premium || 0), 0);
      const commYTD = (payouts ?? [])
        .filter((p) => p.agent_id === a.id)
        .reduce((s, p) => s + (p.commission_amount || 0), 0);
      const directReports = agents.filter((x) => x.upline_email === a.email).length;
      map.set(a.id, { activePrem, commYTD, directReports });
    }
    return map;
  }, [agents, activePolicies, payouts]);

  /* ---------- search highlighting ---------- */
  const highlightedIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(
      agents
        .filter((a) =>
          `${a.first_name} ${a.last_name} ${a.email}`.toLowerCase().includes(q)
        )
        .map((a) => a.id)
    );
  }, [agents, searchQuery]);

  const firstMatchId = useMemo(() => {
    if (!rootNode || highlightedIds.size === 0) return null;
    return findFirstMatch(rootNode, highlightedIds);
  }, [rootNode, highlightedIds]);

  const firstMatchRef = useRef<HTMLDivElement | null>(null);

  // Auto-expand ancestor paths to every highlighted node, then scroll
  useEffect(() => {
    if (highlightedIds.size === 0 || !rootNode) return;

    const byEmail = new Map(agents.map((a) => [a.email, a]));
    const toExpand = new Set<string>();

    for (const id of highlightedIds) {
      const agent = agents.find((a) => a.id === id);
      if (!agent) continue;
      let current: Agent | undefined = agent;
      while (current?.upline_email) {
        const parent = byEmail.get(current.upline_email);
        if (parent) {
          toExpand.add(parent.id);
          current = parent;
        } else break;
      }
    }

    if (toExpand.size > 0) {
      setExpandedSet((prev) => {
        const next = new Set(prev);
        for (const id of toExpand) next.add(id);
        return next;
      });
    }

    const timer = setTimeout(() => {
      firstMatchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(timer);
  }, [highlightedIds, agents, rootNode]);

  /* ---------- render ---------- */
  if (!rootNode) return null;

  const ctx: TreeRenderCtx = {
    expandedSet,
    highlightedIds,
    statsMap,
    onSelect: onSelectAgent,
    onToggle: toggleNode,
    firstMatchId,
    firstMatchRef,
  };

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div>
          {searchQuery.trim() && highlightedIds.size > 0 && (
            <p className="text-xs text-muted-foreground">
              {highlightedIds.size} match{highlightedIds.size !== 1 ? "es" : ""} highlighted
              in tree
            </p>
          )}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
        </div>
      </div>

      {/* Scrollable tree canvas */}
      <div className="overflow-auto rounded-lg border border-border bg-card p-8 min-h-[400px]">
        <div className="inline-flex justify-center w-full min-w-max">
          <RenderNode node={rootNode} ctx={ctx} isRoot />
        </div>
      </div>
    </div>
  );
}
