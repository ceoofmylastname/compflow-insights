import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useAgents, useArchiveAgent, useDeleteAgent, Agent } from "@/hooks/useAgents";
import { usePolicies, getPoliciesArray } from "@/hooks/usePolicies";
import { useCommissionPayouts } from "@/hooks/useCommissionPayouts";
import { useAgentContracts, useCreateAgentContract, useDeleteAgentContract } from "@/hooks/useAgentContracts";
import { formatCurrency, formatDate, formatNumber } from "@/lib/formatters";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, UserPlus, Copy, Plus, Trash2, Archive, Download } from "lucide-react";
import { usePositionOptions } from "@/hooks/usePositions";
import { downloadTemplate } from "@/lib/csv-utils";
import { InviteAgentModal } from "@/components/agents/InviteAgentModal";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { OrgTree } from "@/components/agents/OrgTree";
import { useCanImport } from "@/hooks/useCanImport";

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
  const archiveAgent = useArchiveAgent();
  const deleteAgent = useDeleteAgent();
  const { positions: positionOptions } = usePositionOptions();
  const { data: policiesRaw } = usePolicies({ status: ["Active"] });
  const policies = getPoliciesArray(policiesRaw);
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

  const positions = positionOptions.length > 0
    ? positionOptions
    : [...new Set(downline.map((a) => a.position).filter(Boolean))].sort() as string[];

  const getUplineName = (email: string | null) => {
    if (!email) return "--";
    const a = agents?.find((x) => x.email === email);
    return a ? `${a.first_name} ${a.last_name}` : email;
  };

  const getAgentStats = (agentId: string) => {
    const activePrem = policies.filter((p) => p.resolved_agent_id === agentId).reduce((s, p) => s + (p.annual_premium || 0), 0);
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
    const appHost = import.meta.env.VITE_APP_HOSTNAME || "baseshophq.com";
    const url = `https://${appHost}/signup?invite=${token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied to clipboard");
  };

  const columns: Column<Agent>[] = [
    { key: "name", label: "Full Name", render: (r) => `${r.first_name} ${r.last_name}` },
    { key: "email", label: "Email" },
    { key: "npn", label: "NPN" },
    { key: "phone", label: "Phone", render: (r) => r.phone || "--" },
    { key: "position", label: "Position" },
    { key: "upline_email", label: "Upline", render: (r) => getUplineName(r.upline_email) },
    { key: "contract_type", label: "Contract Type" },
    { key: "start_date", label: "Start Date", render: (r) => formatDate(r.start_date) },
    {
      key: "last_login_at",
      label: "Last Login",
      render: (r) =>
        r.last_login_at
          ? formatDistanceToNow(new Date(r.last_login_at), { addSuffix: true })
          : "--",
    },
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
                  onClick={() => {
                    if (!confirm(`Archive ${r.first_name} ${r.last_name}? They will be moved to Archived Agents.`)) return;
                    archiveAgent.mutate(r.id);
                  }}
                >
                  <Archive className="mr-2 h-3.5 w-3.5" /> Archive
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    if (!confirm(`Permanently delete ${r.first_name} ${r.last_name}? This action cannot be undone.`)) return;
                    deleteAgent.mutate(r.id);
                  }}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Agent Roster</h1>
          <div className="flex gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
              <TabsList>
                <TabsTrigger value="table">Table View</TabsTrigger>
                <TabsTrigger value="orgchart">Org Chart</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" onClick={() => downloadTemplate("agents")}>
              <Download className="mr-2 h-4 w-4" /> Template
            </Button>
            <Button size="sm" className="btn-primary-elevated" onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" /> Invite Agent
            </Button>
          </div>
        </div>

        {/* Search — shared between table and org chart views */}
        <div className="card-elevated p-3 flex flex-wrap gap-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email..." className="w-64" />
          {viewMode === "table" && (
            <>
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
            </>
          )}
        </div>

        {viewMode === "table" ? (
          <>
            {isLoading ? (
              <SkeletonTable columns={9} />
            ) : filtered.length === 0 ? (
              <EmptyState title="No agents in your roster" description="Invite agents to build your team." action={{ label: "Invite Agent", onClick: () => setInviteOpen(true) }} />
            ) : (
              <DataTable columns={columns} data={filtered} pageSize={25} />
            )}
          </>
        ) : (
          <OrgTree
            agents={agents ?? []}
            currentAgentEmail={currentAgent?.email ?? ""}
            onSelectAgent={setProfileAgent}
            searchQuery={search}
          />
        )}
      </div>

      <InviteAgentModal open={inviteOpen} onOpenChange={setInviteOpen} />

      <Sheet open={!!profileAgent} onOpenChange={(v) => !v && setProfileAgent(null)}>
        <SheetContent className="overflow-y-auto">
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

                <Tabs defaultValue="details">
                  <TabsList className="w-full">
                    <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                    <TabsTrigger value="contracts" className="flex-1">Contracts</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="space-y-4 mt-3">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Position</span><span>{profileAgent.position || "--"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">NPN</span><span>{profileAgent.npn || "--"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{profileAgent.phone || "--"}</span></div>
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
                  </TabsContent>

                  <TabsContent value="contracts" className="mt-3">
                    <AgentContractsTab agentId={profileAgent.id} isOwner={isOwner} />
                  </TabsContent>
                </Tabs>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
};

function AgentContractsTab({ agentId, isOwner }: { agentId: string; isOwner: boolean }) {
  const { data: contracts, isLoading } = useAgentContracts(agentId);
  const createContract = useCreateAgentContract();
  const deleteContract = useDeleteAgentContract();

  const [adding, setAdding] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [agentNumber, setAgentNumber] = useState("");
  const [contractType, setContractType] = useState("Direct Pay");
  const [contractStatus, setContractStatus] = useState("Active");
  const [startDate, setStartDate] = useState("");

  const handleAdd = () => {
    if (!carrier.trim()) return;
    createContract.mutate({
      agent_id: agentId,
      carrier: carrier.trim(),
      agent_number: agentNumber.trim() || undefined,
      contract_type: contractType,
      status: contractStatus,
      start_date: startDate || undefined,
    }, {
      onSuccess: () => {
        setAdding(false);
        setCarrier("");
        setAgentNumber("");
        setContractType("Direct Pay");
        setContractStatus("Active");
        setStartDate("");
      },
    });
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading contracts...</p>;
  }

  return (
    <div className="space-y-3">
      {isOwner && !adding && (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Contract
        </Button>
      )}

      {adding && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div><Label className="text-xs">Carrier</Label><Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. Mutual of Omaha" className="h-8 text-sm" /></div>
          <div><Label className="text-xs">Agent Number</Label><Input value={agentNumber} onChange={(e) => setAgentNumber(e.target.value)} placeholder="Optional" className="h-8 text-sm" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={contractType} onValueChange={setContractType}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Direct Pay">Direct Pay</SelectItem>
                  <SelectItem value="LOA">LOA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={contractStatus} onValueChange={setContractStatus}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label className="text-xs">Start Date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-sm" /></div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={createContract.isPending || !carrier.trim()}>
              {createContract.isPending ? "Saving..." : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {(!contracts || contracts.length === 0) ? (
        <p className="text-sm text-muted-foreground">No carrier contracts on file.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Carrier</TableHead>
              <TableHead className="text-xs">Agent #</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              {isOwner && <TableHead className="text-xs w-10"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs">{c.carrier}</TableCell>
                <TableCell className="text-xs font-mono">{c.agent_number || "--"}</TableCell>
                <TableCell className="text-xs">{c.contract_type || "--"}</TableCell>
                <TableCell className="text-xs">{c.status || "--"}</TableCell>
                {isOwner && (
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => deleteContract.mutate(c.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default AgentRoster;
