import { useState, useMemo, useCallback, useRef, useEffect, memo, createContext, useContext } from "react";
import type { Agent } from "@/hooks/useAgents";
import { usePolicies, getPoliciesArray } from "@/hooks/usePolicies";
import { useCommissionPayouts } from "@/hooks/useCommissionPayouts";
import { formatCurrency } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Users,
  DollarSign,
  TrendingUp,
  Crown,
  Minus,
  Plus,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

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
  depth: number;
}

interface AgentStats {
  activePrem: number;
  commYTD: number;
  directReports: number;
  lastPolicyDaysAgo: number | null; // null = never wrote
}

const DEFAULT_STATS: AgentStats = { activePrem: 0, commYTD: 0, directReports: 0, lastPolicyDaysAgo: null };

const MAX_INITIAL_DEPTH = 2;
const CHILDREN_GRID_THRESHOLD = 8;
const CHILDREN_PER_PAGE = 8;

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function getPositionColors(position: string | null): { solid: string; light: string; hue: number } {
  if (!position) return { solid: "hsl(var(--muted-foreground))", light: "hsl(var(--muted))", hue: 0 };
  let hash = 0;
  for (let i = 0; i < position.length; i++) hash = position.charCodeAt(i) + ((hash << 5) - hash);
  const hue = ((hash % 360) + 360) % 360;
  return {
    solid: `hsl(${hue} 55% 48%)`,
    light: `hsl(${hue} 55% 48% / 0.12)`,
    hue,
  };
}

type ActivityLevel = "hot" | "active" | "idle" | "dormant";

function getActivityLevel(lastPolicyDaysAgo: number | null): ActivityLevel {
  if (lastPolicyDaysAgo === null) return "dormant";
  if (lastPolicyDaysAgo <= 7) return "hot";
  if (lastPolicyDaysAgo <= 30) return "active";
  return "idle";
}

const ACTIVITY_CONFIG: Record<ActivityLevel, { color: string; pulseColor: string; label: string }> = {
  hot: { color: "bg-emerald-500", pulseColor: "bg-emerald-400", label: "Hot" },
  active: { color: "bg-sky-500", pulseColor: "bg-sky-400", label: "Active" },
  idle: { color: "bg-amber-500", pulseColor: "bg-amber-400", label: "Idle" },
  dormant: { color: "bg-red-500", pulseColor: "bg-red-400", label: "Dormant" },
};

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

  function build(agent: Agent, depth: number): TreeNode {
    const children = (byUpline.get(agent.email) ?? []).sort((a, b) =>
      a.last_name.localeCompare(b.last_name)
    );
    return { agent, children: children.map((c) => build(c, depth + 1)), depth };
  }

  return build(root, 0);
}

function collectIds(node: TreeNode): string[] {
  return [node.agent.id, ...node.children.flatMap(collectIds)];
}

function collectIdsToDepth(node: TreeNode, maxDepth: number): string[] {
  if (node.depth > maxDepth) return [];
  return [node.agent.id, ...node.children.flatMap((c) => collectIdsToDepth(c, maxDepth))];
}

function findFirstMatch(node: TreeNode, ids: Set<string>): string | null {
  if (ids.has(node.agent.id)) return node.agent.id;
  for (const child of node.children) {
    const found = findFirstMatch(child, ids);
    if (found) return found;
  }
  return null;
}

function countAllNodes(node: TreeNode): number {
  return 1 + node.children.reduce((s, c) => s + countAllNodes(c), 0);
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
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

const TreeContext = createContext<TreeRenderCtx | null>(null);
function useTreeCtx() {
  return useContext(TreeContext)!;
}

/* ------------------------------------------------------------------ */
/*  NodeCard                                                           */
/* ------------------------------------------------------------------ */

const NodeCard = memo(function NodeCard({
  agent,
  childCount,
  stats,
  isExpanded,
  isHighlighted,
  isRoot,
}: {
  agent: Agent;
  childCount: number;
  stats: AgentStats;
  isExpanded: boolean;
  isHighlighted: boolean;
  isRoot?: boolean;
}) {
  const ctx = useTreeCtx();
  const initials = `${(agent.first_name || "?")[0]}${(agent.last_name || "?")[0]}`.toUpperCase();
  const colors = getPositionColors(agent.position);
  const activity = getActivityLevel(stats.lastPolicyDaysAgo);
  const activityCfg = ACTIVITY_CONFIG[activity];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "group relative rounded-xl border backdrop-blur-xl transition-all duration-200 cursor-pointer select-none",
        isRoot ? "w-60" : "w-52",
        "bg-card/80 border-border/50 hover:border-primary/30",
        "shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-hover)] hover:-translate-y-0.5",
        isHighlighted && "ring-2 ring-warning ring-offset-2 ring-offset-background"
      )}
      onClick={() => ctx.onSelect(agent)}
    >
      {/* Gradient top accent */}
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-xl"
        style={{
          background: `linear-gradient(90deg, ${colors.solid}, hsl(${(colors.hue + 40) % 360} 55% 58%))`,
        }}
      />

      <div className={cn("p-3.5", isRoot && "p-4")}>
        {/* Avatar row */}
        <div className="flex items-center gap-3">
          {/* Avatar with gradient ring */}
          <div className="relative shrink-0">
            <div
              className={cn(
                "rounded-full p-[2px]",
                isRoot ? "w-12 h-12" : "w-10 h-10"
              )}
              style={{
                background: `linear-gradient(135deg, ${colors.solid}, hsl(${(colors.hue + 60) % 360} 55% 55%))`,
              }}
            >
              <div
                className={cn(
                  "w-full h-full rounded-full flex items-center justify-center font-bold bg-card text-foreground",
                  isRoot ? "text-sm" : "text-xs"
                )}
              >
                {isRoot && <Crown className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 text-warning" />}
                {initials}
              </div>
            </div>
            {/* Activity pulse dot */}
            <div className="absolute -bottom-0.5 -right-0.5">
              <span className={cn("relative flex h-3 w-3")}>
                <span
                  className={cn(
                    "animate-ping absolute inline-flex h-full w-full rounded-full opacity-50",
                    activity === "hot" && activityCfg.pulseColor
                  )}
                />
                <span className={cn("relative inline-flex rounded-full h-3 w-3 border-2 border-card", activityCfg.color)} />
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className={cn("font-semibold text-foreground truncate", isRoot ? "text-sm" : "text-[13px]")}>
              {agent.first_name} {agent.last_name}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {agent.position || "Agent"}
            </p>
          </div>
        </div>

        {/* Badges row */}
        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border",
              activity === "hot" && "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
              activity === "active" && "bg-sky-500/10 text-sky-500 border-sky-500/20",
              activity === "idle" && "bg-amber-500/10 text-amber-500 border-amber-500/20",
              activity === "dormant" && "bg-red-500/10 text-red-500 border-red-500/20"
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", activityCfg.color)} />
            {activityCfg.label}
          </span>
          {agent.contract_type && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium">
              {agent.contract_type}
            </Badge>
          )}
        </div>

        {/* Stats grid */}
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-2">
          <div className="text-center">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Premium</p>
            <p className="text-[11px] font-bold text-foreground mt-0.5">
              {stats.activePrem >= 1000
                ? `$${(stats.activePrem / 1000).toFixed(1)}k`
                : formatCurrency(stats.activePrem)}
            </p>
          </div>
          <div className="text-center border-x border-border/50">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Comm</p>
            <p className="text-[11px] font-bold text-foreground mt-0.5">
              {stats.commYTD >= 1000
                ? `$${(stats.commYTD / 1000).toFixed(1)}k`
                : formatCurrency(stats.commYTD)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Reports</p>
            <p className="text-[11px] font-bold text-foreground mt-0.5">{stats.directReports}</p>
          </div>
        </div>
      </div>

      {/* Expand toggle */}
      {childCount > 0 && (
        <button
          className={cn(
            "flex items-center justify-center gap-1.5 w-full border-t border-border/50 py-2 text-xs font-medium transition-colors rounded-b-xl",
            "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
          onClick={(e) => {
            e.stopPropagation();
            ctx.onToggle(agent.id);
          }}
        >
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {childCount} report{childCount !== 1 ? "s" : ""}
        </button>
      )}
    </motion.div>
  );
});

/* ------------------------------------------------------------------ */
/*  Paginated Grid (for large child counts)                            */
/* ------------------------------------------------------------------ */

function PaginatedChildGrid({ nodes }: { nodes: TreeNode[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(nodes.length / CHILDREN_PER_PAGE);
  const visible = nodes.slice(page * CHILDREN_PER_PAGE, (page + 1) * CHILDREN_PER_PAGE);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {visible.map((node) => (
          <RenderNode key={node.agent.id} node={node} />
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="h-7 px-2"
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="text-xs text-muted-foreground font-medium">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="h-7 px-2"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tree rendering                                                     */
/* ------------------------------------------------------------------ */

function RenderNode({ node, isRoot }: { node: TreeNode; isRoot?: boolean }) {
  const ctx = useTreeCtx();
  const isExpanded = ctx.expandedSet.has(node.agent.id);
  const stats = ctx.statsMap.get(node.agent.id) ?? DEFAULT_STATS;
  const isFirstMatch = node.agent.id === ctx.firstMatchId;
  const useGrid = node.children.length >= CHILDREN_GRID_THRESHOLD;

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
      />

      <AnimatePresence>
        {isExpanded && node.children.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center overflow-hidden"
          >
            {/* Gradient vertical connector */}
            <div className="w-px h-6 bg-gradient-to-b from-primary/40 to-border" />

            {useGrid ? (
              <PaginatedChildGrid nodes={node.children} />
            ) : (
              <RenderChildren nodes={node.children} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RenderChildren({ nodes }: { nodes: TreeNode[] }) {
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
            className="flex flex-col items-center relative pt-6 px-3"
          >
            {/* Vertical connector */}
            <div className="absolute top-0 left-1/2 -translate-x-px w-px h-6 bg-gradient-to-b from-primary/30 to-border/60" />

            {/* Horizontal connectors */}
            {!isOnly && !isLast && (
              <div className="absolute top-0 left-1/2 right-0 h-px bg-gradient-to-r from-primary/30 to-border/40" />
            )}
            {!isOnly && !isFirst && (
              <div className="absolute top-0 left-0 right-1/2 h-px bg-gradient-to-l from-primary/30 to-border/40" />
            )}

            <RenderNode node={node} />
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary Stats Bar                                                  */
/* ------------------------------------------------------------------ */

function SummaryBar({
  agents,
  statsMap,
}: {
  agents: Agent[];
  statsMap: Map<string, AgentStats>;
}) {
  const totals = useMemo(() => {
    let totalPrem = 0;
    let totalComm = 0;
    let hotCount = 0;
    let activeCount = 0;
    let idleCount = 0;
    let dormantCount = 0;

    for (const a of agents) {
      const s = statsMap.get(a.id) ?? DEFAULT_STATS;
      totalPrem += s.activePrem;
      totalComm += s.commYTD;
      const level = getActivityLevel(s.lastPolicyDaysAgo);
      if (level === "hot") hotCount++;
      else if (level === "active") activeCount++;
      else if (level === "idle") idleCount++;
      else dormantCount++;
    }

    return { totalPrem, totalComm, totalAgents: agents.length, hotCount, activeCount, idleCount, dormantCount };
  }, [agents, statsMap]);

  const items = [
    { icon: Users, label: "Total Agents", value: totals.totalAgents.toString(), color: "text-primary" },
    { icon: DollarSign, label: "Total Premium", value: totals.totalPrem >= 1000 ? `$${(totals.totalPrem / 1000).toFixed(0)}k` : formatCurrency(totals.totalPrem), color: "text-emerald-500" },
    { icon: TrendingUp, label: "Total Commission", value: totals.totalComm >= 1000 ? `$${(totals.totalComm / 1000).toFixed(0)}k` : formatCurrency(totals.totalComm), color: "text-sky-500" },
  ];

  const activityPills = [
    { label: "Hot", count: totals.hotCount, cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
    { label: "Active", count: totals.activeCount, cls: "bg-sky-500/10 text-sky-500 border-sky-500/20" },
    { label: "Idle", count: totals.idleCount, cls: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    { label: "Dormant", count: totals.dormantCount, cls: "bg-red-500/10 text-red-500 border-red-500/20" },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 p-3 px-5">
      <div className="flex items-center gap-5">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-2">
            <it.icon className={cn("h-4 w-4", it.color)} />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{it.label}</p>
              <p className="text-sm font-bold text-foreground">{it.value}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {activityPills.map((p) => (
          <span
            key={p.label}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold", p.cls)}
          >
            {p.label}
            <span className="font-bold">{p.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Zoom Controls                                                      */
/* ------------------------------------------------------------------ */

function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  return (
    <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1 rounded-xl bg-card/80 backdrop-blur-xl border border-border/50 shadow-[var(--shadow-lg)] p-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomIn} title="Zoom In">
        <ZoomIn className="h-4 w-4" />
      </Button>
      <div className="text-center text-[10px] font-semibold text-muted-foreground py-0.5">
        {Math.round(zoom * 100)}%
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomOut} title="Zoom Out">
        <ZoomOut className="h-4 w-4" />
      </Button>
      <div className="h-px bg-border/50 mx-1" />
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onFit} title="Fit to screen">
        <Maximize2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main OrgTree Component                                             */
/* ------------------------------------------------------------------ */

export function OrgTree({
  agents,
  currentAgentEmail,
  onSelectAgent,
  searchQuery,
}: OrgTreeProps) {
  /* ---------- tree structure ---------- */
  const rootNode = useMemo(() => buildTree(agents, currentAgentEmail), [agents, currentAgentEmail]);

  /* ---------- expand / collapse ---------- */
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => {
    if (!rootNode) return new Set<string>();
    return new Set(collectIdsToDepth(rootNode, MAX_INITIAL_DEPTH));
  });

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

  /* ---------- zoom & pan ---------- */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.15, 2)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.15, 0.2)), []);
  const handleFit = useCallback(() => {
    if (!canvasRef.current || !contentRef.current) return;
    const canvas = canvasRef.current.getBoundingClientRect();
    const content = contentRef.current.getBoundingClientRect();
    const scaleX = (canvas.width - 64) / (content.width / zoom);
    const scaleY = (canvas.height - 64) / (content.height / zoom);
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.2), 1.5);
    setZoom(newZoom);
    setPan({ x: 0, y: 0 });
  }, [zoom]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Only start pan if middle-click or if on the canvas background
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("[data-card]")) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    e.preventDefault();
  }, [pan]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  }, []);

  const onMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => Math.min(Math.max(z - e.deltaY * 0.002, 0.2), 2));
    }
  }, []);

  /* ---------- stats ---------- */
  const { data: policiesRaw } = usePolicies({ status: ["Active"] });
  const activePolicies = getPoliciesArray(policiesRaw);

  // All policies for "last policy" calculation
  const { data: allPoliciesRaw } = usePolicies({});
  const allPolicies = getPoliciesArray(allPoliciesRaw);

  const { data: payouts } = useCommissionPayouts({
    dateFrom: `${new Date().getFullYear()}-01-01T00:00:00Z`,
  });

  const statsMap = useMemo(() => {
    const map = new Map<string, AgentStats>();
    const now = Date.now();
    for (const a of agents) {
      const activePrem = activePolicies
        .filter((p) => p.resolved_agent_id === a.id)
        .reduce((s, p) => s + (p.annual_premium || 0), 0);
      const commYTD = (payouts ?? [])
        .filter((p) => p.agent_id === a.id)
        .reduce((s, p) => s + (p.commission_amount || 0), 0);
      const directReports = agents.filter((x) => x.upline_email === a.email).length;

      // Find most recent policy date
      const agentPolicies = allPolicies.filter((p) => p.resolved_agent_id === a.id);
      let lastPolicyDaysAgo: number | null = null;
      if (agentPolicies.length > 0) {
        const dates = agentPolicies
          .map((p) => p.effective_date || p.application_date || p.created_at)
          .filter(Boolean)
          .map((d) => new Date(d!).getTime());
        if (dates.length > 0) {
          const latest = Math.max(...dates);
          lastPolicyDaysAgo = Math.floor((now - latest) / (1000 * 60 * 60 * 24));
        }
      }

      map.set(a.id, { activePrem, commYTD, directReports, lastPolicyDaysAgo });
    }
    return map;
  }, [agents, activePolicies, allPolicies, payouts]);

  /* ---------- search highlighting ---------- */
  const highlightedIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(
      agents
        .filter((a) => `${a.first_name} ${a.last_name} ${a.email}`.toLowerCase().includes(q))
        .map((a) => a.id)
    );
  }, [agents, searchQuery]);

  const firstMatchId = useMemo(() => {
    if (!rootNode || highlightedIds.size === 0) return null;
    return findFirstMatch(rootNode, highlightedIds);
  }, [rootNode, highlightedIds]);

  const firstMatchRef = useRef<HTMLDivElement | null>(null);

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

  const totalNodes = countAllNodes(rootNode);

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
    <TreeContext.Provider value={ctx}>
      <div className="space-y-3">
        {/* Summary stats */}
        <SummaryBar agents={agents} statsMap={statsMap} />

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {searchQuery.trim() && highlightedIds.size > 0 && (
              <p className="text-xs text-muted-foreground">
                {highlightedIds.size} match{highlightedIds.size !== 1 ? "es" : ""} highlighted
              </p>
            )}
            <span className="text-xs text-muted-foreground/60">
              {totalNodes} agent{totalNodes !== 1 ? "s" : ""} in hierarchy
            </span>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={expandAll} className="text-xs">
              Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll} className="text-xs">
              Collapse All
            </Button>
          </div>
        </div>

        {/* Zoomable + pannable canvas */}
        <div
          ref={canvasRef}
          className="relative overflow-hidden rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm min-h-[500px] cursor-grab active:cursor-grabbing"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
          style={{
            backgroundImage:
              "radial-gradient(circle, hsl(var(--border) / 0.3) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          <div
            ref={contentRef}
            className="inline-flex justify-center w-full min-w-max p-8"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "top center",
              transition: isPanning.current ? "none" : "transform 0.2s ease",
            }}
          >
            <RenderNode node={rootNode} isRoot />
          </div>

          <ZoomControls zoom={zoom} onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} onFit={handleFit} />
        </div>
      </div>
    </TreeContext.Provider>
  );
}
