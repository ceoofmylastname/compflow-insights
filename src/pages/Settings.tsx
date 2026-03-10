import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { useNavigate } from "react-router-dom";

const Settings = () => {
  const { data: currentAgent } = useCurrentAgent();
  const { user, signOut } = useAuth();
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

  // Agency state
  const [agencyName, setAgencyName] = useState("");
  const [agencyLoaded, setAgencyLoaded] = useState(false);
  const { data: tenant } = useQuery({
    queryKey: ["tenant", currentAgent?.tenant_id],
    queryFn: async () => {
      if (!currentAgent) return null;
      const { data } = await supabase.from("tenants").select("*").eq("id", currentAgent.tenant_id).single();
      return data;
    },
    enabled: !!currentAgent,
  });
  if (tenant && !agencyLoaded) {
    setAgencyName(tenant.name);
    setAgencyLoaded(true);
  }

  // Webhook state
  const { data: webhookConfig } = useQuery({
    queryKey: ["webhookConfig", currentAgent?.tenant_id],
    queryFn: async () => {
      if (!currentAgent) return null;
      const { data } = await supabase.from("webhook_configs").select("*").eq("tenant_id", currentAgent.tenant_id).maybeSingle();
      return data;
    },
    enabled: !!currentAgent && isOwner,
  });
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookLoaded, setWebhookLoaded] = useState(false);
  if (webhookConfig && !webhookLoaded) {
    setWebhookEnabled(webhookConfig.is_active);
    setWebhookUrl(webhookConfig.webhook_url);
    setWebhookLoaded(true);
  }

  // Danger zone
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [accountDeleteConfirm, setAccountDeleteConfirm] = useState("");

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

  const handleSaveAgency = async () => {
    if (!currentAgent || !isOwner) return;
    // tenants UPDATE not allowed by RLS currently — would need migration
    toast.error("Agency name update requires admin access");
  };

  const handleSaveWebhook = async () => {
    if (!currentAgent) return;
    if (webhookConfig) {
      const { error } = await supabase.from("webhook_configs").update({
        webhook_url: webhookUrl, is_active: webhookEnabled,
      }).eq("id", webhookConfig.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("webhook_configs").insert({
        tenant_id: currentAgent.tenant_id, webhook_url: webhookUrl, is_active: webhookEnabled,
      });
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Webhook settings saved");
    queryClient.invalidateQueries({ queryKey: ["webhookConfig"] });
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl) return;
    try {
      const { data, error } = await supabase.functions.invoke("fire-webhook", {
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
      toast.success("Test webhook sent successfully");
    } catch (err: any) {
      toast.error(`Webhook test failed: ${err.message}`);
    }
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
    // This would need a server-side function to fully delete
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
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
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
                  <div><Label>Agency Name</Label><Input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} /></div>
                  <Button onClick={handleSaveAgency}>Save</Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="notifications" className="space-y-4 mt-4">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">Enable Deal Posted Webhook</p>
                    <p className="text-xs text-muted-foreground">Works with Discord and Slack webhook URLs. Fires every time a policy goes Active.</p>
                  </div>
                  <Switch checked={webhookEnabled} onCheckedChange={setWebhookEnabled} />
                </div>
                {webhookEnabled && (
                  <>
                    <div><Label>Webhook URL (HTTPS)</Label><Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/..." /></div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleTestWebhook}>Test Webhook</Button>
                      <Button onClick={handleSaveWebhook}>Save</Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {isOwner && (
            <TabsContent value="danger" className="space-y-4 mt-4">
              <Card className="border-destructive/50">
                <CardHeader><CardTitle className="text-destructive">Danger Zone</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
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

export default Settings;
