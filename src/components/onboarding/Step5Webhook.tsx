import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { Webhook, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onNext: () => void;
  onBack: () => void;
}

type Provider = "discord" | "slack";

export function Step5Webhook({ onNext, onBack }: Props) {
  const { data: currentAgent } = useCurrentAgent();
  const [provider, setProvider] = useState<Provider>("discord");
  const [url, setUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

  const fireTest = async () => {
    if (!url.trim()) {
      toast.error("Paste your webhook URL first");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const message = "Welcome from Base Shop HQ. Your webhook is working.";
      const payload = provider === "discord" ? { content: message } : { text: message };

      const { data, error } = await supabase.functions.invoke("fire-webhook", {
        body: { webhook_url: url.trim(), payload },
      });
      if (error) throw error;
      const ok = (data as { ok?: boolean } | null)?.ok === true;
      if (ok) {
        setTestResult("success");
        toast.success("Test message sent");
      } else {
        setTestResult("error");
        toast.error(`Webhook returned status ${(data as any)?.status ?? "unknown"}`);
      }
    } catch (e: any) {
      setTestResult("error");
      toast.error(e.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!currentAgent?.tenant_id) return;
    if (!url.trim()) {
      onNext();
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("webhook_configs")
        .insert({
          tenant_id: currentAgent.tenant_id,
          webhook_url: url.trim(),
          event_type: "deal.posted",
          is_active: true,
        } as any);
      if (error) throw error;
      toast.success("Webhook saved");
      onNext();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">Connect a webhook (optional)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Get notified in Discord or Slack when a deal goes Active. Skip this if you want to set it up later under Settings → Integrations.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="rounded-lg bg-primary/10 p-2">
            <Webhook className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Webhook URL</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Paste the URL from your Discord or Slack server's webhook settings.
            </p>
          </div>
        </div>

        <Tabs value={provider} onValueChange={(v) => setProvider(v as Provider)}>
          <TabsList className="grid grid-cols-2 w-full max-w-xs">
            <TabsTrigger value="discord">Discord</TabsTrigger>
            <TabsTrigger value="slack">Slack</TabsTrigger>
          </TabsList>
          <TabsContent value="discord" className="mt-3">
            <p className="text-xs text-muted-foreground">
              Server Settings → Integrations → Webhooks → New Webhook → Copy URL.
            </p>
          </TabsContent>
          <TabsContent value="slack" className="mt-3">
            <p className="text-xs text-muted-foreground">
              Slack workspace → Apps → Incoming Webhooks → Add to Slack → Copy URL.
            </p>
          </TabsContent>
        </Tabs>

        <div className="mt-4">
          <Label>Webhook URL</Label>
          <Input
            value={url}
            onChange={(e) => { setUrl(e.target.value); setTestResult(null); }}
            placeholder={
              provider === "discord"
                ? "https://discord.com/api/webhooks/..."
                : "https://hooks.slack.com/services/..."
            }
          />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Button variant="outline" onClick={fireTest} disabled={testing || !url.trim()}>
            {testing ? "Sending..." : "Send test message"}
          </Button>
          {testResult === "success" && (
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Test message sent
            </span>
          )}
          {testResult === "error" && (
            <span className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" /> Test failed. Double-check the URL.
            </span>
          )}
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onNext}>Skip</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : url.trim() ? "Save and continue" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
