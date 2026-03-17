import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useWebhookConfigs, useCreateWebhook, useDeleteWebhook } from "@/hooks/useWebhookConfigs";
import { useAgents } from "@/hooks/useAgents";
import { Trash2, Send, Plus, RefreshCw, Camera } from "lucide-react";
import { formatCurrency, formatDate, formatNumber } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { recalculateAllPayouts } from "@/lib/commission-engine";
import { useTenant, useUpdateTenant } from "@/hooks/useTenant";
import { useCarriers } from "@/hooks/useCarriers";
import { useAgentContracts } from "@/hooks/useAgentContracts";
import type { AgentContract } from "@/hooks/useAgentContracts";

const Settings = () => {
  const { data: currentAgent } = useCurrentAgent();
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isOwner = currentAgent?.is_owner ?? false;
  const { data: tenant } = useTenant();
  const updateTenant = useUpdateTenant();

  // Profile state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [npn, setNpn] = useState("");
  const [annualGoal, setAnnualGoal] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  if (currentAgent && !profileLoaded) {
    setFirstName(currentAgent.first_name);
    setLastName(currentAgent.last_name);
    setNpn(currentAgent.npn || "");
    setAnnualGoal(currentAgent.annual_goal ? String(currentAgent.annual_goal) : "");
    setProfileLoaded(true);
  }

  // Agency branding state
  const [agencyName, setAgencyName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [brandingLoaded, setBrandingLoaded] = useState(false);

  if (tenant && !brandingLoaded) {
    setAgencyName(tenant.agency_name || "");
    setLogoUrl(tenant.logo_url || "");
    setPrimaryColor(tenant.primary_color || "#6366f1");
    setBrandingLoaded(true);
  }

  const handleSaveBranding = async () => {
    updateTenant.mutate({
      agency_name: agencyName.trim() || null,
      logo_url: logoUrl.trim() || null,
      primary_color: primaryColor || "#6366f1",
    });
  };

  // Danger zone
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [accountDeleteConfirm, setAccountDeleteConfirm] = useState("");
  const [recalculating, setRecalculating] = useState(false);

  const handleRecalculateAll = async () => {
    if (!currentAgent) return;
    setRecalculating(true);
    try {
      const result = await recalculateAllPayouts(currentAgent.tenant_id, supabase);

      // Also flag chargeback risk alongside payout recalculation
      try {
        await supabase.rpc("flag_chargeback_risk");
      } catch {}

      if (result.errors.length > 0) {
        toast.error(`Recalculated ${result.processed} policies with ${result.errors.length} error(s)`);
      } else {
        toast.success(`Recalculated payouts for ${result.processed} policies`);
      }
      queryClient.invalidateQueries({ queryKey: ["commissionPayouts"] });
      queryClient.invalidateQueries({ queryKey: ["policies"] });
    } catch (err: any) {
      toast.error(`Recalculation failed: ${err.message}`);
    } finally {
      setRecalculating(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!currentAgent) return;
    setSaving(true);
    const { error } = await supabase.from("agents").update({
      first_name: firstName, last_name: lastName, npn: npn || null, annual_goal: annualGoal ? parseFloat(annualGoal) : null,
    }).eq("id", currentAgent.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile saved");
    queryClient.invalidateQueries({ queryKey: ["currentAgent"] });
  };

  const handleDeleteAllPolicies = async () => {
    if (deleteConfirm !== "DELETE ALL POLICIES" || !currentAgent) return;
    const { error: pe } = await supabase.from("commission_payouts").delete().eq("tenant_id", currentAgent.tenant_id);
    const { error } = await supabase.from("policies").delete().eq("tenant_id", currentAgent.tenant_id);
    if (error || pe) { toast.error("Failed to delete"); return; }
    toast.success("All policies and payouts deleted");
    setDeleteConfirm("");
    queryClient.invalidateQueries();
  };

  const handleDeleteAccount = async () => {
    if (accountDeleteConfirm !== "DELETE ACCOUNT") return;
    await signOut();
    navigate("/");
    toast.success("Account deletion initiated");
  };

  return (
    <AppLayout>
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>

        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="writing-numbers">My Writing Numbers</TabsTrigger>
            {isOwner && <TabsTrigger value="agency">Agency</TabsTrigger>}
            {isOwner && <TabsTrigger value="aliases">Carrier Aliases</TabsTrigger>}
            {isOwner && <TabsTrigger value="webhooks">Webhooks</TabsTrigger>}
            {isOwner && <TabsTrigger value="billing">Billing</TabsTrigger>}
            {isOwner && <TabsTrigger value="danger">Danger Zone</TabsTrigger>}
          </TabsList>

          <TabsContent value="profile" className="space-y-4 mt-4">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>First Name</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
                  <div><Label>Last Name</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
                </div>
                <div><Label>Email</Label><Input value={currentAgent?.email || ""} disabled /></div>
                <div><Label>NPN</Label><Input value={npn} onChange={(e) => setNpn(e.target.value)} /></div>
                <div><Label>Annual Goal</Label><Input value={annualGoal} onChange={(e) => setAnnualGoal(e.target.value)} type="number" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Position</Label><Input value={currentAgent?.position || "--"} disabled /></div>
                  <div><Label>Contract Type</Label><Input value={currentAgent?.contract_type || "--"} disabled /></div>
                </div>
                <Button onClick={handleSaveProfile} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="writing-numbers" className="space-y-4 mt-4">
            <WritingNumbersSection agentId={currentAgent?.id} tenantId={currentAgent?.tenant_id} />
          </TabsContent>

          {isOwner && (
            <TabsContent value="agency" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Agency Branding</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Agency Name</Label>
                    <Input
                      value={agencyName}
                      onChange={(e) => setAgencyName(e.target.value)}
                      placeholder="Your agency name"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Displayed in the sidebar instead of "CompFlow"
                    </p>
                  </div>
                  <div>
                    <Label>Logo URL</Label>
                    <Input
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="https://example.com/logo.png"
                    />
                    {logoUrl && (
                      <div className="mt-2 p-2 border border-border rounded-md inline-block bg-muted/30">
                        <img
                          src={logoUrl}
                          alt="Logo preview"
                          className="h-10 w-auto object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>Primary Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-9 w-9 rounded border border-border cursor-pointer"
                      />
                      <Input
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        placeholder="#6366f1"
                        className="w-32"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleSaveBranding}
                    disabled={updateTenant.isPending}
                  >
                    {updateTenant.isPending ? "Saving..." : "Save Branding"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {isOwner && (
            <TabsContent value="aliases" className="space-y-4 mt-4">
              <CarrierAliasesSection tenantId={currentAgent?.tenant_id} />
            </TabsContent>
          )}

          {isOwner && (
            <TabsContent value="webhooks" className="space-y-4 mt-4">
              <WebhooksSection />
            </TabsContent>
          )}

          {isOwner && (
            <TabsContent value="billing" className="space-y-4 mt-4">
              <BillingSection tenantId={currentAgent?.tenant_id} />
            </TabsContent>
          )}

          {isOwner && (
            <TabsContent value="danger" className="space-y-4 mt-4">
              <Card className="border-destructive/50">
                <CardHeader><CardTitle className="text-destructive">Danger Zone</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-sm text-foreground font-medium">Recalculate All Payouts</p>
                    <p className="text-xs text-muted-foreground">Re-run the commission engine for every policy. Use after updating commission rates retroactively.</p>
                    <Button variant="outline" onClick={handleRecalculateAll} disabled={recalculating}>
                      <RefreshCw className={`h-4 w-4 mr-1 ${recalculating ? "animate-spin" : ""}`} />
                      {recalculating ? "Recalculating..." : "Recalculate All Payouts"}
                    </Button>
                  </div>
                  <div className="space-y-2 border-t border-border pt-4">
                    <p className="text-sm text-foreground font-medium">Delete All Policies</p>
                    <p className="text-xs text-muted-foreground">This will permanently delete all policies and commission payouts for your agency.</p>
                    <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder='Type "DELETE ALL POLICIES" to confirm' />
                    <Button variant="destructive" onClick={handleDeleteAllPolicies} disabled={deleteConfirm !== "DELETE ALL POLICIES"}>Delete All Policies</Button>
                  </div>
                  <div className="space-y-2 border-t border-border pt-4">
                    <p className="text-sm text-foreground font-medium">Delete Account</p>
                    <p className="text-xs text-muted-foreground">Permanently delete your agency and all associated data.</p>
                    <Input value={accountDeleteConfirm} onChange={(e) => setAccountDeleteConfirm(e.target.value)} placeholder='Type "DELETE ACCOUNT" to confirm' />
                    <Button variant="destructive" onClick={handleDeleteAccount} disabled={accountDeleteConfirm !== "DELETE ACCOUNT"}>Delete Account</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
};

function WebhooksSection() {
  const { data: webhooks, isLoading } = useWebhookConfigs();
  const createWebhook = useCreateWebhook();
  const deleteWebhook = useDeleteWebhook();

  const [url, setUrl] = useState("");
  const [eventType, setEventType] = useState("deal.posted");
  const [active, setActive] = useState(true);
  const [urlError, setUrlError] = useState("");

  const handleAdd = () => {
    if (!url.startsWith("https://")) {
      setUrlError("URL must start with https://");
      return;
    }
    setUrlError("");
    createWebhook.mutate({ webhook_url: url, event_type: eventType, is_active: active }, {
      onSuccess: () => { setUrl(""); setActive(true); },
    });
  };

  const handleTest = async (webhookUrl: string) => {
    try {
      const { error } = await supabase.functions.invoke("fire-webhook", {
        body: {
          webhook_url: webhookUrl,
          payload: {
            event: "test",
            content: "🧪 Test webhook from CompFlow",
            posted_at: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;
      toast.success("Test webhook sent");
    } catch (err: any) {
      toast.error(`Test failed: ${err.message}`);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Webhook URL (HTTPS)</Label>
            <Input
              value={url}
              onChange={(e) => { setUrl(e.target.value); setUrlError(""); }}
              placeholder="https://discord.com/api/webhooks/..."
            />
            {urlError && <p className="text-xs text-destructive mt-1">{urlError}</p>}
          </div>
          <div>
            <Label>Event Type</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="deal.posted">deal.posted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label>Active</Label>
          </div>
          <Button onClick={handleAdd} disabled={createWebhook.isPending}>
            <Plus className="h-4 w-4 mr-1" />
            {createWebhook.isPending ? "Saving..." : "Add Webhook"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Existing Webhooks</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !webhooks?.length ? (
            <p className="text-sm text-muted-foreground">No webhooks configured yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((wh) => (
                  <TableRow key={wh.id}>
                    <TableCell className="font-mono text-xs max-w-[300px] truncate">{wh.webhook_url}</TableCell>
                    <TableCell><Badge variant="secondary">{wh.event_type}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={wh.is_active ? "default" : "outline"}>
                        {wh.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleTest(wh.webhook_url)} title="Test">
                          <Send className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteWebhook.mutate(wh.id)} title="Delete">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function CarrierAliasesSection({ tenantId }: { tenantId?: string }) {
  const { data: agents } = useAgents();
  const queryClient = useQueryClient();

  const { data: aliases, isLoading } = useQuery({
    queryKey: ["carrierAliases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("carrier_agent_aliases")
        .select("*")
        .order("carrier");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [carrier, setCarrier] = useState("");
  const [writingAgentId, setWritingAgentId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [saving, setSaving] = useState(false);

  const getAgentName = (id: string) => {
    const a = agents?.find((ag) => ag.id === id);
    return a ? `${a.first_name} ${a.last_name}` : id;
  };

  const handleAdd = async () => {
    if (!carrier.trim() || !writingAgentId.trim() || !agentId || !tenantId) return;
    setSaving(true);
    const { error } = await supabase.from("carrier_agent_aliases").insert({
      carrier: carrier.trim(),
      writing_agent_id: writingAgentId.trim(),
      agent_id: agentId,
      tenant_id: tenantId,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Alias added");
    setCarrier("");
    setWritingAgentId("");
    setAgentId("");
    queryClient.invalidateQueries({ queryKey: ["carrierAliases"] });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("carrier_agent_aliases").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Alias deleted");
    queryClient.invalidateQueries({ queryKey: ["carrierAliases"] });
  };

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Add Carrier Alias</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Carrier</Label>
            <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. Mutual of Omaha" />
          </div>
          <div>
            <Label>Writing Agent ID (from carrier)</Label>
            <Input value={writingAgentId} onChange={(e) => setWritingAgentId(e.target.value)} placeholder="e.g. ABC12345" />
          </div>
          <div>
            <Label>Resolved Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
              <SelectContent>
                {(agents ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.first_name} {a.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={saving || !carrier.trim() || !writingAgentId.trim() || !agentId}>
            <Plus className="h-4 w-4 mr-1" />
            {saving ? "Saving..." : "Add Alias"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Existing Aliases</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !aliases?.length ? (
            <p className="text-sm text-muted-foreground">No carrier aliases configured yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Writing Agent ID</TableHead>
                  <TableHead>Resolved Agent</TableHead>
                  <TableHead className="w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aliases.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.carrier}</TableCell>
                    <TableCell className="font-mono text-xs">{a.writing_agent_id}</TableCell>
                    <TableCell>{getAgentName(a.agent_id)}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(a.id)} title="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function BillingSection({ tenantId }: { tenantId?: string }) {
  const queryClient = useQueryClient();
  const [snapshotting, setSnapshotting] = useState(false);

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ["billingSnapshots", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("billing_snapshots")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("snapshot_date", { ascending: false })
        .limit(24);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const handleSnapshot = async () => {
    if (!tenantId) return;
    setSnapshotting(true);
    try {
      const { data: count, error } = await supabase.rpc("snapshot_active_agents", {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["billingSnapshots"] });
      toast.success(`Snapshot taken — ${count ?? 0} active agents recorded`);
    } catch (err: any) {
      toast.error(`Snapshot failed: ${err.message}`);
    } finally {
      setSnapshotting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Active Agent Billing</CardTitle>
            <Button variant="outline" size="sm" onClick={handleSnapshot} disabled={snapshotting}>
              <Camera className="h-4 w-4 mr-1" />
              {snapshotting ? "Snapshotting..." : "Take Snapshot"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Track monthly active agent counts for billing. Take a snapshot at the end of each month to record the current count.
          </p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !snapshots?.length ? (
            <p className="text-sm text-muted-foreground">No billing snapshots yet. Take your first snapshot to start tracking.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Snapshot Date</TableHead>
                  <TableHead className="text-right">Active Agents</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>{formatDate(s.snapshot_date)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatNumber(s.active_agent_count)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.notes || "--"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function WritingNumbersSection({ agentId, tenantId }: { agentId?: string; tenantId?: string }) {
  const { data: carriers } = useCarriers();
  const { data: contracts } = useAgentContracts(agentId);
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const contractMap = useMemo(() => {
    const map = new Map<string, AgentContract>();
    for (const c of contracts ?? []) {
      map.set(c.carrier, c);
    }
    return map;
  }, [contracts]);

  const activeCarriers = useMemo(
    () => (carriers ?? []).filter((c) => c.status === "active"),
    [carriers]
  );

  const handleSave = async () => {
    if (!agentId || !tenantId) return;
    setSaving(true);
    let saved = 0;
    try {
      for (const [carrierName, value] of Object.entries(edits)) {
        const existing = contractMap.get(carrierName);
        const trimmed = value.trim();

        if (existing) {
          if (trimmed !== (existing.agent_number || "")) {
            const { error } = await supabase
              .from("agent_contracts")
              .update({ agent_number: trimmed || null } as any)
              .eq("id", existing.id);
            if (error) throw error;
            saved++;
          }
        } else if (trimmed) {
          const { error } = await supabase.from("agent_contracts").insert({
            tenant_id: tenantId,
            agent_id: agentId,
            carrier: carrierName,
            agent_number: trimmed,
            contract_type: "Direct Pay",
            status: "active",
          } as any);
          if (error) throw error;
          saved++;
        }
      }
      if (saved > 0) {
        queryClient.invalidateQueries({ queryKey: ["agentContracts"] });
        toast.success(`${saved} writing number(s) saved`);
      }
      setEdits({});
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">My Writing Numbers</CardTitle>
        <p className="text-xs text-muted-foreground">
          Enter your carrier writing numbers to enable automatic agent resolution during imports.
        </p>
      </CardHeader>
      <CardContent>
        {activeCarriers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No carriers configured yet. Ask your agency owner to add carriers.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Writing Number</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeCarriers.map((carrier) => {
                  const existing = contractMap.get(carrier.name);
                  const currentValue = edits[carrier.name] ?? existing?.agent_number ?? "";
                  return (
                    <TableRow key={carrier.id}>
                      <TableCell className="font-medium">{carrier.name}</TableCell>
                      <TableCell>
                        <Input
                          value={currentValue}
                          onChange={(e) =>
                            setEdits((prev) => ({ ...prev, [carrier.name]: e.target.value }))
                          }
                          placeholder="Enter writing number"
                          className="h-8 w-48 font-mono text-xs"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Button onClick={handleSave} disabled={saving || Object.keys(edits).length === 0} className="mt-4">
              {saving ? "Saving..." : "Save Writing Numbers"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default Settings;
