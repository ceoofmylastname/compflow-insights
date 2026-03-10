import { useState, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useAgents, Agent } from "@/hooks/useAgents";
import { usePolicies } from "@/hooks/usePolicies";
import { useCommissionPayouts } from "@/hooks/useCommissionPayouts";
import { formatCurrency, formatDate, formatNumber } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, UserPlus, Copy } from "lucide-react";
import { InviteAgentModal } from "@/components/agents/InviteAgentModal";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const AgentRoster = () => {
  const [viewMode, setViewMode] = useState<"table" | "orgchart">("table");
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [contractTypeFilter, setContractTypeFilter] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [profileAgent, setProfileAgent] = useState<Agent | null>(null);
  const [editingGoal, setEditingGoal] = useState<{ id: string; value: string } | null>(null);

  const { data: currentAgent } = useCurrentAgent();
  const { data: agents, isLoading, error, refetch } = useAgents();
  const { data: policies } = usePolicies({ status: ["Active"] });
  const { data: payouts } = useCommissionPayouts({ dateFrom: `${new Date().getFullYear()}-01-01T00:00:00Z` });
  const queryClient = useQueryClient();

  const isOwner = currentAgent?.is_owner ?? false;

  const downline = useMemo(() => {
    if (!agents || !currentAgent) return [];
    return agents.filter((a) => a.id !== currentAgent.id);
  }, [agents, currentAgent]);

  const filtered = useMemo(() => {
    let result = downline;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((a) =>
        `${a.first_name} ${a.last_name} ${a.email}`.toLowerCase().includes(s)
      );
    }
    if (positionFilter) result = result.filter((a) => a.position === positionFilter);
    if (contractTypeFilter) result = result.filter((a) => a.contract_type === contractTypeFilter);
    return result;
  }, [downline, search, positionFilter, contractTypeFilter]);

  const positions = useMemo(() => [...new Set(downline.map((a) => a.position).filter(Boolean))].sort() as string[], [downline]);

  const getUplineName = (email: string | null) => {
    if (!email) return "--";
    const a = agents?.find((x) => x.email === email);
    return a ? `${a.first_name} ${a.last_name}` : email;
  };

  const getAgentStats = (agentId: string) => {
    const activePrem = (policies ?? []).filter((p) => p.resolved_agent_id === agentId).reduce((s, p) => s + (p.annual_premium || 0), 0);
    const commYTD = (payouts ?? []).filter((p) => p.agent_id === agentId).reduce((s, p) => s + (p.commission_amount || 0), 0);
    const directReports = (agents ?? []).filter((a) => {
      const agent = agents?.find((x) => x.id === agentId);
      return agent && a.upline_email === agent.email;
    }).length;
    return { activePrem, commYTD, directReports };
  };

  const handleGoalSave = async (agentId: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) {
      toast.error("Invalid goal amount");
      setEditingGoal(null);
      return;
    }
    const { error } = await supabase
      .from("agents")
      .update({ annual_goal: num })
      .eq("id", agentId);
    if (error) {
      toast.error("Failed to update goal");
    } else {
      toast.success("Annual goal updated");
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    }
    setEditingGoal(null);
  };

  const handleCopyInviteLink = async (agent: Agent) => {
    if (!currentAgent) return;
    const token = crypto.randomUUID();
    const { error } = await supabase.from("invites").insert({
      tenant_id: currentAgent.tenant_id,
      invited_by_agent_id: currentAgent.id,
      invitee_email: agent.email,
      invitee_upline_email: agent.upline_email || currentAgent.email,
      token,
    });
    if (error) {
      toast.error("Failed to create invite link");
      return;
    }
    const url = `${window.location.origin}/signup?token=${token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied to clipboard");
  };

  const columns: Column<Agent>[] = [
    { key: "name", label: "Full Name", render: (r) => `${r.first_name} ${r.last_name}` },
    { key: "email", label: "Email" },
    { key: "npn", label: "NPN" },
    { key: "position", label: "Position" },
    { key: "upline_email", label: "Upline", render: (r) => getUplineName(r.upline_email) },
    { key: "contract_type", label: "Contract Type" },
    { key: "start_date", label: "Start Date", render: (r) => formatDate(r.start_date) },
    {
      key: "annual_goal",
      label: "Annual Goal",
      render: (r) => {
        if (isOwner && editingGoal?.id === r.id) {
          return (
            <Input
              autoFocus
              className="h-7 w-28 text-xs"
              defaultValue={editingGoal.value}
              onBlur={(e) => handleGoalSave(r.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleGoalSave(r.id, (e.target as HTMLInputElement).value);
                if (e.key === "Escape") setEditingGoal(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          );
        }
        return (
          <span
            className={isOwner ? "cursor-pointer hover:underline" : ""}
            onClick={(e) => {
              if (!isOwner) return;
              e.stopPropagation();
              setEditingGoal({ id: r.id, value: String(r.annual_goal || 0) });
            }}
          >
            {formatCurrency(Number(r.annual_goal))}
          </span>
        );
      },
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      render: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setProfileAgent(r)}>View Profile</DropdownMenuItem>
            {isOwner && (
              <>
                <DropdownMenuItem onClick={() => handleCopyInviteLink(r)}>
                  <Copy className="mr-2 h-3.5 w-3.5" /> Copy Invite Link
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={async () => {
                    if (!confirm(`Remove ${r.first_name} ${r.last_name}?`)) return;
                    toast.error("Remove not available — contact support");
                  }}
                >
                  Remove
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  // Org chart tree building
  const buildTree = useCallback((rootEmail: string): (Agent & { children: any[] })[] => {
    if (!agents) return [];
    const children = agents.filter((a) => a.upline_email === rootEmail);
    return children.map((c) => ({ ...c, children: buildTree(c.email) }));
  }, [agents]);

  const renderOrgNode = (agent: Agent & { children: any[] }, depth: number = 0) => {
    const initials = `${agent.first_name[0]}${agent.last_name[0]}`.toUpperCase();
    return (
      <div key={agent.id} className="flex flex-col items-center">
        <div className="flex flex-col items-center cursor-pointer" onClick={() => setProfileAgent(agent)}>
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
            {initials}
          </div>
          <p className="text-xs font-medium text-foreground mt-1">{agent.first_name} {agent.last_name}</p>
          <p className="text-[10px] text-muted-foreground">{agent.position || "Agent"}</p>
        </div>
        {agent.children.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border">
            <div className="flex gap-6 flex-wrap justify-center">
              {agent.children.map((c: any) => renderOrgNode(c, depth + 1))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  const orgTree = currentAgent ? buildTree(currentAgent.email) : [];

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Agent Roster</h1>
          <div className="flex gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
              <TabsList>
                <TabsTrigger value="table">Table View</TabsTrigger>
                <TabsTrigger value="orgchart">Org Chart</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" /> Invite Agent
            </Button>
          </div>
        </div>

        {viewMode === "table" ? (
          <>
            <div className="flex flex-wrap gap-3">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email..." className="w-64" />
              <Select value={positionFilter} onValueChange={setPositionFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="All Positions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {positions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={contractTypeFilter} onValueChange={setContractTypeFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Direct Pay">Direct Pay</SelectItem>
                  <SelectItem value="LOA">LOA</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <SkeletonTable columns={9} />
            ) : filtered.length === 0 ? (
              <EmptyState title="No agents in your roster" description="Invite agents to build your team." action={{ label: "Invite Agent", onClick: () => setInviteOpen(true) }} />
            ) : (
              <DataTable columns={columns} data={filtered} pageSize={25} />
            )}
          </>
        ) : (
          <div className="overflow-auto rounded-lg border border-border bg-card p-8 min-h-[400px]">
            {currentAgent && (
              <div className="flex flex-col items-center">
                <div className="flex flex-col items-center cursor-pointer" onClick={() => setProfileAgent(currentAgent)}>
                  <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground">
                    {currentAgent.first_name[0]}{currentAgent.last_name[0]}
                  </div>
                  <p className="text-sm font-semibold text-foreground mt-1">{currentAgent.first_name} {currentAgent.last_name}</p>
                  <p className="text-xs text-muted-foreground">{currentAgent.position || "Owner"}</p>
                </div>
                {orgTree.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex gap-8 flex-wrap justify-center">
                      {orgTree.map((c) => renderOrgNode(c))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <InviteAgentModal open={inviteOpen} onOpenChange={setInviteOpen} />

      <Sheet open={!!profileAgent} onOpenChange={(v) => !v && setProfileAgent(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Agent Profile</SheetTitle>
          </SheetHeader>
          {profileAgent && (() => {
            const stats = getAgentStats(profileAgent.id);
            return (
              <div className="space-y-4 mt-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold text-primary">
                    {profileAgent.first_name[0]}{profileAgent.last_name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{profileAgent.first_name} {profileAgent.last_name}</p>
                    <p className="text-sm text-muted-foreground">{profileAgent.email}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Position</span><span>{profileAgent.position || "--"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">NPN</span><span>{profileAgent.npn || "--"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Contract Type</span><span>{profileAgent.contract_type || "--"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Start Date</span><span>{formatDate(profileAgent.start_date)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Annual Goal</span><span>{formatCurrency(Number(profileAgent.annual_goal))}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Upline</span><span>{getUplineName(profileAgent.upline_email)}</span></div>
                </div>
                <div className="border-t border-border pt-4 space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Active Premium</span><span className="font-semibold">{formatCurrency(stats.activePrem)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Commission YTD</span><span className="font-semibold">{formatCurrency(stats.commYTD)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Direct Reports</span><span className="font-semibold">{stats.directReports}</span></div>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
};

export default AgentRoster;
