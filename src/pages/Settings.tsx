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
import { Trash2, Send, Plus, RefreshCw, Camera, Copy, Globe, Lock, CheckCircle2, Clock, ExternalLink, Eye, EyeOff, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useTenantCustomFields,
  useCreateCustomField,
  useUpdateCustomField,
  useDeleteCustomField,
  generateFieldKey,
  type TenantCustomField,
  type CustomFieldDataType,
  type CustomFieldAppliesTo,
} from "@/hooks/useTenantCustomFields";
import { useEffect } from "react";
import { useCustomDomain } from "@/hooks/useCustomDomain";
import type { Tenant } from "@/hooks/useTenant";
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
  const [phone, setPhone] = useState("");
  const [annualGoal, setAnnualGoal] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  if (currentAgent && !profileLoaded) {
    setFirstName(currentAgent.first_name);
    setLastName(currentAgent.last_name);
    setNpn(currentAgent.npn || "");
    setPhone(currentAgent.phone || "");
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
      first_name: firstName, last_name: lastName, npn: npn || null, phone: phone || null, annual_goal: annualGoal ? parseFloat(annualGoal) : null,
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
          {/* Horizontal scroll container — Settings has 9 tabs for owners,
              which overflows mobile viewports. Bleed to screen edges with
              negative margin so the scroll feels natural. */}
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
            <TabsList className="w-max">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="writing-numbers">My Writing Numbers</TabsTrigger>
              {isOwner && <TabsTrigger value="agency">Agency</TabsTrigger>}
              {isOwner && <TabsTrigger value="domain">Domain</TabsTrigger>}
              {isOwner && <TabsTrigger value="aliases">Carrier Aliases</TabsTrigger>}
              {isOwner && <TabsTrigger value="webhooks">Webhooks</TabsTrigger>}
              {isOwner && <TabsTrigger value="billing">Billing</TabsTrigger>}
              {isOwner && <TabsTrigger value="custom-fields">Custom Fields</TabsTrigger>}
              {isOwner && <TabsTrigger value="danger">Danger Zone</TabsTrigger>}
            </TabsList>
          </div>

          <TabsContent value="profile" className="space-y-4 mt-4">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>First Name</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
                  <div><Label>Last Name</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
                </div>
                <div><Label>Email</Label><Input value={currentAgent?.email || ""} disabled /></div>
                <div><Label>NPN</Label><Input value={npn} onChange={(e) => setNpn(e.target.value)} /></div>
                <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" /></div>
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
                      Displayed in the sidebar instead of "BaseshopHQ"
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
            <TabsContent value="domain" className="space-y-4 mt-4">
              <DomainSection tenant={tenant} />
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
            <TabsContent value="custom-fields" className="space-y-4 mt-4">
              <CustomFieldsSection />
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
            content: "🧪 Test webhook from BaseshopHQ",
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

const WN_CONTRACT_TYPES = ["Direct Pay", "LOA"];
const WN_STATUSES = ["active", "inactive", "pending"];

interface WritingNumberEdit {
  agent_number?: string;
  contract_type?: string;
  status?: string;
}

function WritingNumbersSection({ agentId, tenantId }: { agentId?: string; tenantId?: string }) {
  const { data: carriers } = useCarriers();
  const { data: contracts } = useAgentContracts(agentId);
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, WritingNumberEdit>>({});
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

  const updateEdit = (carrierName: string, field: keyof WritingNumberEdit, value: string) => {
    setEdits((prev) => ({
      ...prev,
      [carrierName]: { ...prev[carrierName], [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!agentId || !tenantId) return;
    setSaving(true);
    let saved = 0;
    try {
      for (const [carrierName, edit] of Object.entries(edits)) {
        const existing = contractMap.get(carrierName);
        const trimmedNumber = (edit.agent_number ?? existing?.agent_number ?? "").trim();
        const contractType = edit.contract_type ?? existing?.contract_type ?? "Direct Pay";
        const contractStatus = edit.status ?? existing?.status ?? "active";

        if (existing) {
          const updates: Record<string, any> = {};
          if (edit.agent_number !== undefined && trimmedNumber !== (existing.agent_number || "")) {
            updates.agent_number = trimmedNumber || null;
          }
          if (edit.contract_type !== undefined && contractType !== existing.contract_type) {
            updates.contract_type = contractType;
          }
          if (edit.status !== undefined && contractStatus !== existing.status) {
            updates.status = contractStatus;
          }
          if (Object.keys(updates).length > 0) {
            const { error } = await supabase
              .from("agent_contracts")
              .update(updates as any)
              .eq("id", existing.id);
            if (error) throw error;
            saved++;
          }
        } else if (trimmedNumber) {
          const { error } = await supabase.from("agent_contracts").insert({
            tenant_id: tenantId,
            agent_id: agentId,
            carrier: carrierName,
            agent_number: trimmedNumber,
            contract_type: contractType,
            status: contractStatus,
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
                  <TableHead>Contract Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeCarriers.map((carrier) => {
                  const existing = contractMap.get(carrier.name);
                  const currentNumber = edits[carrier.name]?.agent_number ?? existing?.agent_number ?? "";
                  const currentType = edits[carrier.name]?.contract_type ?? existing?.contract_type ?? "Direct Pay";
                  const currentStatus = edits[carrier.name]?.status ?? existing?.status ?? "active";
                  return (
                    <TableRow key={carrier.id}>
                      <TableCell className="font-medium">{carrier.name}</TableCell>
                      <TableCell>
                        <Input
                          value={currentNumber}
                          onChange={(e) => updateEdit(carrier.name, "agent_number", e.target.value)}
                          placeholder="Enter writing number"
                          className="h-8 w-40 font-mono text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Select value={currentType} onValueChange={(v) => updateEdit(carrier.name, "contract_type", v)}>
                          <SelectTrigger className="h-8 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WN_CONTRACT_TYPES.map((ct) => (
                              <SelectItem key={ct} value={ct}>{ct}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={currentStatus} onValueChange={(v) => updateEdit(carrier.name, "status", v)}>
                          <SelectTrigger className="h-8 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WN_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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

function DomainSection({ tenant }: { tenant?: Tenant | null }) {
  const customDomain = useCustomDomain();
  const [domainInput, setDomainInput] = useState("");
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const domainStatus = tenant?.domain_status || "none";
  const subdomain = tenant?.subdomain;
  const subdomainUrl = subdomain ? `${subdomain}.baseshophq.com` : null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const handleConnect = () => {
    if (!domainInput.trim()) return;
    customDomain.mutate({ action: "add", hostname: domainInput.trim() });
  };

  const handleVerify = () => {
    customDomain.mutate({ action: "verify" }, {
      onSuccess: (data) => {
        if (!data.verified) {
          toast.info("DNS not yet propagated — check your records and try again in a few minutes.");
        }
      },
    });
  };

  const handleRemove = () => {
    customDomain.mutate({ action: "remove" });
    setShowRemoveConfirm(false);
  };

  // Parse CNAME name from custom_domain (e.g. "app.smithinsurance.com" → "app")
  const cnameName = tenant?.custom_domain
    ? tenant.custom_domain.split(".")[0]
    : "app";
  const txtName = tenant?.custom_domain
    ? `_cf-custom-hostname.${cnameName}`
    : "_cf-custom-hostname.app";

  return (
    <div className="space-y-4">
      {/* Subdomain info card */}
      {subdomainUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Your BaseshopHQ Subdomain
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono bg-muted px-3 py-2 rounded-md flex-1">
                {subdomainUrl}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(`https://${subdomainUrl}`)}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Share this with your agents as their login URL.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Domain state: none */}
      {domainStatus === "none" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connect a Custom Domain</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the full subdomain you want to use (e.g. app.youragency.com)
            </p>
            <div className="flex gap-2">
              <Input
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="app.youragency.com"
                className="flex-1"
              />
              <Button
                onClick={handleConnect}
                disabled={customDomain.isPending || !domainInput.trim()}
              >
                {customDomain.isPending ? "Connecting..." : "Connect Domain"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Domain state: pending */}
      {domainStatus === "pending" && tenant?.custom_domain && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              Pending Verification — {tenant.custom_domain}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add these two DNS records at your domain provider.
              DNS changes typically take 5–30 minutes to propagate.
            </p>

            <div className="space-y-3">
              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Record 1 — Route traffic to BaseshopHQ
                </p>
                <div className="grid grid-cols-[80px_1fr] gap-y-1 text-sm">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-mono">CNAME</span>
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-mono">{cnameName}</span>
                  <span className="text-muted-foreground">Value</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">proxy.baseshophq.com</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard("proxy.baseshophq.com")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="text-muted-foreground">TTL</span>
                  <span className="font-mono">Auto</span>
                </div>
              </div>

              {tenant.domain_txt_verification && (
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Record 2 — Verify domain ownership
                  </p>
                  <div className="grid grid-cols-[80px_1fr] gap-y-1 text-sm">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-mono">TXT</span>
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-mono">{txtName}</span>
                    <span className="text-muted-foreground">Value</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs break-all">
                        {tenant.domain_txt_verification}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() =>
                          copyToClipboard(tenant.domain_txt_verification!)
                        }
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="text-muted-foreground">TTL</span>
                    <span className="font-mono">Auto</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleVerify}
                disabled={customDomain.isPending}
              >
                {customDomain.isPending ? "Checking..." : "Check Verification"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRemoveConfirm(true)}
              >
                Remove Domain
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Domain state: active */}
      {domainStatus === "active" && tenant?.custom_domain && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Custom domain active
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono bg-muted px-3 py-2 rounded-md flex-1">
                {tenant.custom_domain}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copyToClipboard(`https://${tenant.custom_domain}`)
                }
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copy
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Your agents can log in at:{" "}
              <span className="font-mono text-foreground">
                https://{tenant.custom_domain}
              </span>
            </p>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="default" className="bg-emerald-600">
                SSL Active
              </Badge>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowRemoveConfirm(true)}
            >
              Remove Domain
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Domain state: failed */}
      {domainStatus === "failed" && tenant?.custom_domain && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Domain verification failed — {tenant.custom_domain}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              DNS verification failed. Please check your DNS records and try again.
            </p>
            <div className="flex gap-2">
              <Button onClick={handleVerify} disabled={customDomain.isPending}>
                Retry Verification
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRemoveConfirm(true)}
              >
                Remove Domain
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Remove confirmation dialog */}
      {showRemoveConfirm && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm font-medium text-foreground">
              Remove custom domain?
            </p>
            <p className="text-sm text-muted-foreground">
              Your agents will no longer be able to log in at{" "}
              <span className="font-mono">{tenant?.custom_domain}</span>. They
              will still be able to use your BaseshopHQ subdomain.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowRemoveConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRemove}
                disabled={customDomain.isPending}
              >
                {customDomain.isPending ? "Removing..." : "Remove Domain"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Custom Fields Section                                              */
/* ------------------------------------------------------------------ */

const DATA_TYPES: { value: CustomFieldDataType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Boolean" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
];

const APPLIES_TO_OPTIONS: { value: CustomFieldAppliesTo; label: string }[] = [
  { value: "policies", label: "Policies" },
  { value: "agents", label: "Agents" },
  { value: "commission_levels", label: "Commission Levels" },
  { value: "all", label: "All Imports" },
];

interface CustomFieldFormState {
  label: string;
  key: string;
  data_type: CustomFieldDataType;
  required: boolean;
  applies_to: CustomFieldAppliesTo;
  visible_in_dashboard: boolean;
}

const emptyFormState: CustomFieldFormState = {
  label: "",
  key: "",
  data_type: "text",
  required: false,
  applies_to: "policies",
  visible_in_dashboard: true,
};

function CustomFieldsSection() {
  const { data: fields, isLoading } = useTenantCustomFields();
  const { data: agents } = useAgents();
  const createField = useCreateCustomField();
  const updateField = useUpdateCustomField();
  const deleteField = useDeleteCustomField();

  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<CustomFieldFormState>(emptyFormState);
  const [keyEdited, setKeyEdited] = useState(false);
  const [editingField, setEditingField] = useState<TenantCustomField | null>(null);
  const [editForm, setEditForm] = useState<CustomFieldFormState>(emptyFormState);
  const [deletingField, setDeletingField] = useState<TenantCustomField | null>(null);

  // Auto-generate key from label as the owner types — only until they
  // explicitly edit the key field, then leave it alone.
  useEffect(() => {
    if (!keyEdited && adding) {
      setAddForm((prev) => ({ ...prev, key: generateFieldKey(prev.label) }));
    }
  }, [addForm.label, keyEdited, adding]);

  const resetAddForm = () => {
    setAdding(false);
    setAddForm(emptyFormState);
    setKeyEdited(false);
  };

  const handleAddSubmit = () => {
    if (!addForm.label.trim() || !addForm.key.trim()) {
      toast.error("Label and key are required");
      return;
    }
    createField.mutate(
      {
        field_label: addForm.label.trim(),
        field_key: addForm.key.trim(),
        data_type: addForm.data_type,
        required: addForm.required,
        applies_to: addForm.applies_to,
        visible_in_dashboard: addForm.visible_in_dashboard,
      },
      { onSuccess: resetAddForm }
    );
  };

  const handleStartEdit = (field: TenantCustomField) => {
    setEditingField(field);
    setEditForm({
      label: field.field_label,
      key: field.field_key, // immutable; shown disabled
      data_type: field.data_type,
      required: field.required,
      applies_to: field.applies_to,
      visible_in_dashboard: field.visible_in_dashboard,
    });
  };

  const handleEditSave = () => {
    if (!editingField) return;
    if (!editForm.label.trim()) {
      toast.error("Label is required");
      return;
    }
    updateField.mutate(
      {
        id: editingField.id,
        field_label: editForm.label.trim(),
        data_type: editForm.data_type,
        required: editForm.required,
        applies_to: editForm.applies_to,
        visible_in_dashboard: editForm.visible_in_dashboard,
      },
      { onSuccess: () => setEditingField(null) }
    );
  };

  const handleToggleVisible = (field: TenantCustomField) => {
    updateField.mutate({
      id: field.id,
      visible_in_dashboard: !field.visible_in_dashboard,
    });
  };

  const handleDelete = () => {
    if (!deletingField) return;
    deleteField.mutate(deletingField.id, {
      onSuccess: () => setDeletingField(null),
    });
  };

  const getCreatorName = (authUserId: string | null) => {
    if (!authUserId) return "—";
    const a = agents?.find((x) => (x as any).auth_user_id === authUserId);
    return a ? `${a.first_name} ${a.last_name}` : "—";
  };

  const formatAppliesTo = (v: CustomFieldAppliesTo) =>
    APPLIES_TO_OPTIONS.find((o) => o.value === v)?.label ?? v;

  const formatDataType = (v: CustomFieldDataType) =>
    DATA_TYPES.find((o) => o.value === v)?.label ?? v;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Custom Fields</CardTitle>
            {!adding && (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Custom Field
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Define your own fields for the import wizard. Stored as JSONB on the target table.
            Field keys are immutable after creation — to rename a field, change its label.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add form */}
          {adding && (
            <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Field Label</Label>
                  <Input
                    value={addForm.label}
                    onChange={(e) => setAddForm({ ...addForm, label: e.target.value })}
                    placeholder="e.g. Agent Writing Number"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Field Key</Label>
                  <Input
                    value={addForm.key}
                    onChange={(e) => {
                      setAddForm({ ...addForm, key: e.target.value });
                      setKeyEdited(true);
                    }}
                    placeholder="agent_writing_number"
                    className="h-8 text-sm font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    snake_case. Becomes the JSONB key.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Data Type</Label>
                  <Select
                    value={addForm.data_type}
                    onValueChange={(v) => setAddForm({ ...addForm, data_type: v as CustomFieldDataType })}
                  >
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DATA_TYPES.map((dt) => (
                        <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Applies To</Label>
                  <Select
                    value={addForm.applies_to}
                    onValueChange={(v) => setAddForm({ ...addForm, applies_to: v as CustomFieldAppliesTo })}
                  >
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {APPLIES_TO_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={addForm.required}
                    onCheckedChange={(v) => setAddForm({ ...addForm, required: !!v })}
                  />
                  Required on import
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={addForm.visible_in_dashboard}
                    onCheckedChange={(v) => setAddForm({ ...addForm, visible_in_dashboard: !!v })}
                  />
                  Visible in dashboard
                </label>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddSubmit} disabled={createField.isPending}>
                  {createField.isPending ? "Saving..." : "Save Field"}
                </Button>
                <Button size="sm" variant="outline" onClick={resetAddForm} disabled={createField.isPending}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Fields table */}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !fields || fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No custom fields yet. Add one above, or define one inline while mapping a CSV import.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Applies To</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Visible</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead className="w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.field_label}</TableCell>
                    <TableCell className="font-mono text-xs">{f.field_key}</TableCell>
                    <TableCell className="text-xs">{formatDataType(f.data_type)}</TableCell>
                    <TableCell className="text-xs">{formatAppliesTo(f.applies_to)}</TableCell>
                    <TableCell className="text-xs">{f.required ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-xs">{f.visible_in_dashboard ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{getCreatorName(f.created_by)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleStartEdit(f)} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleToggleVisible(f)}
                          title={f.visible_in_dashboard ? "Hide from dashboard" : "Show in dashboard"}
                        >
                          {f.visible_in_dashboard ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setDeletingField(f)}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
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

      {/* Edit dialog */}
      <Dialog open={!!editingField} onOpenChange={(v) => !v && setEditingField(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Custom Field</DialogTitle>
            <DialogDescription>
              The field key cannot be changed after creation — change the label to rename.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Field Label</Label>
              <Input
                value={editForm.label}
                onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Field Key (immutable)</Label>
              <Input value={editForm.key} disabled className="h-8 text-sm font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data Type</Label>
                <Select
                  value={editForm.data_type}
                  onValueChange={(v) => setEditForm({ ...editForm, data_type: v as CustomFieldDataType })}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DATA_TYPES.map((dt) => (
                      <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Applies To</Label>
                <Select
                  value={editForm.applies_to}
                  onValueChange={(v) => setEditForm({ ...editForm, applies_to: v as CustomFieldAppliesTo })}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {APPLIES_TO_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={editForm.required}
                  onCheckedChange={(v) => setEditForm({ ...editForm, required: !!v })}
                />
                Required on import
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={editForm.visible_in_dashboard}
                  onCheckedChange={(v) => setEditForm({ ...editForm, visible_in_dashboard: !!v })}
                />
                Visible in dashboard
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingField(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={updateField.isPending}>
              {updateField.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deletingField} onOpenChange={(v) => !v && setDeletingField(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Custom Field</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground">
            Deleting <strong>{deletingField?.field_label}</strong> will remove it from the import
            wizard and dashboard column pickers. Existing data already stored under this field will
            remain in the database but will no longer be displayed. Continue?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingField(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteField.isPending}>
              {deleteField.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default Settings;
