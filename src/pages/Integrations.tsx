import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useWebhookConfigs, useCreateWebhook, useDeleteWebhook } from "@/hooks/useWebhookConfigs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Send, Plus, Webhook, Plug, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PLACEHOLDER_INTEGRATIONS = [
  { name: "Zapier", description: "Connect with 5,000+ apps", icon: Zap, status: "coming_soon" },
  { name: "Slack", description: "Post deal notifications to channels", icon: Plug, status: "coming_soon" },
  { name: "HubSpot", description: "Sync contacts and deals", icon: Plug, status: "coming_soon" },
];

const Integrations = () => {
  const { data: currentAgent } = useCurrentAgent();
  const isOwner = currentAgent?.is_owner ?? false;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Integrations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect BaseshopHQ with your favorite tools and services.
          </p>
        </div>

        {isOwner && <WebhooksSection />}

        <div>
          <h2 className="text-lg font-semibold mb-3">Available Integrations</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PLACEHOLDER_INTEGRATIONS.map((integration) => (
              <Card key={integration.name} className="opacity-75">
                <CardContent className="flex items-center gap-3 pt-6">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <integration.icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{integration.name}</p>
                    <p className="text-xs text-muted-foreground">{integration.description}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">Soon</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
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
    createWebhook.mutate(
      { webhook_url: url, event_type: eventType, is_active: active },
      { onSuccess: () => { setUrl(""); setActive(true); } }
    );
  };

  const handleTest = async (webhookUrl: string) => {
    try {
      const { error } = await supabase.functions.invoke("fire-webhook", {
        body: {
          webhook_url: webhookUrl,
          payload: {
            event: "test",
            content: "Test webhook from BaseshopHQ",
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
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Webhook className="h-5 w-5" /> Webhooks
      </h2>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Add Webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Webhook URL (HTTPS)</Label>
            <Input
              value={url}
              onChange={(e) => { setUrl(e.target.value); setUrlError(""); }}
              placeholder="https://discord.com/api/webhooks/..."
              className="h-8 text-sm"
            />
            {urlError && <p className="text-xs text-destructive mt-1">{urlError}</p>}
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label className="text-xs">Event Type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deal.posted">deal.posted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} />
              <Label className="text-xs">Active</Label>
            </div>
            <Button size="sm" onClick={handleAdd} disabled={createWebhook.isPending}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              {createWebhook.isPending ? "Adding..." : "Add"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading webhooks...</p>
      ) : !webhooks?.length ? (
        <p className="text-sm text-muted-foreground">No webhooks configured yet.</p>
      ) : (
        <Card>
          <CardContent className="p-0">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default Integrations;
