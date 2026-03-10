import { useState } from "react";
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
import { Trash2, Send, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { recalculateAllPayouts } from "@/lib/commission-engine";

const Settings = () => {
  const { data: currentAgent } = useCurrentAgent();
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isOwner = currentAgent?.is_owner ?? false;

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

  // Danger zone
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [accountDeleteConfirm, setAccountDeleteConfirm] = useState("");
  const [recalculating, setRecalculating] = useState(false);

  const handleRecalculateAll = async () => {
    if (!currentAgent) return;
    setRecalculating(true);
    try {
      const result = await recalculateAllPayouts(currentAgent.tenant_id, supabase);
      if (result.errors.length > 0) {
        toast.error(`Recalculated ${result.processed} policies with ${result.errors.length} error(s)`);
      } else {
        toast.success(`Recalculated payouts for ${result.processed} policies`);
      }
      queryClient.invalidateQueries({ queryKey: ["commissionPayouts"] });
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
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>

        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            {isOwner && <TabsTrigger value="agency">Agency</TabsTrigger>}
            {isOwner && <TabsTrigger value="aliases">Carrier Aliases</TabsTrigger>}
            {isOwner && <TabsTrigger value="webhooks">Webhooks</TabsTrigger>}
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

          {isOwner && (
            <TabsContent value="agency" className="space-y-4 mt-4">
              <Card>
                <CardContent className="space-y-4 pt-6">
                  <p className="text-sm text-muted-foreground">Agency name management coming soon.</p>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {isOwner && (
            <TabsContent value="webhooks" className="space-y-4 mt-4">
              <WebhooksSection />
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

export default Settings;
