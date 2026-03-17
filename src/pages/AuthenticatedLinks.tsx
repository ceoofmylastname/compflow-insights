import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useAgents } from "@/hooks/useAgents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Link2, Key, AlertTriangle } from "lucide-react";

interface GeneratedLink {
  email: string;
  url: string;
  generatedAt: string;
}

const AuthenticatedLinks = () => {
  const { data: currentAgent } = useCurrentAgent();
  const { data: agents } = useAgents();
  const isOwner = currentAgent?.is_owner ?? false;

  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState<GeneratedLink[]>([]);

  const handleGenerate = async () => {
    const selectedAgent = agents?.find((a) => a.id === selectedAgentId);
    const email = selectedAgent?.email || customEmail.trim();
    if (!email) {
      toast.error("Please select an agent or enter an email");
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-auth-link", {
        body: { email },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No link returned");

      const newLink: GeneratedLink = {
        email,
        url: data.url,
        generatedAt: new Date().toISOString(),
      };
      setGeneratedLinks((prev) => [newLink, ...prev]);
      await navigator.clipboard.writeText(data.url);
      toast.success("Magic link generated and copied to clipboard");
    } catch (err: any) {
      toast.error(`Failed to generate link: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Copied to clipboard");
  };

  if (!isOwner) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Only agency owners can access authenticated links.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Authenticated Links</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate one-time magic login links for your agents. Links expire after 24 hours.
          </p>
        </div>

        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Security Notice</p>
              <p className="text-xs text-muted-foreground">
                Magic links grant full access to the selected agent's account. Only share them through secure channels.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" /> Generate Magic Link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Select Agent</Label>
              <Select value={selectedAgentId} onValueChange={(v) => { setSelectedAgentId(v); setCustomEmail(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an agent" />
                </SelectTrigger>
                <SelectContent>
                  {(agents ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.first_name} {a.last_name} ({a.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex-1 h-px bg-border" />
              <span>or enter email directly</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div>
              <Label>Email Address</Label>
              <Input
                value={customEmail}
                onChange={(e) => { setCustomEmail(e.target.value); setSelectedAgentId(""); }}
                placeholder="agent@example.com"
                type="email"
              />
            </div>
            <Button
              className="w-full"
              onClick={handleGenerate}
              disabled={generating || (!selectedAgentId && !customEmail.trim())}
            >
              <Link2 className="h-4 w-4 mr-2" />
              {generating ? "Generating..." : "Generate & Copy Link"}
            </Button>
          </CardContent>
        </Card>

        {generatedLinks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generated Links (this session)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Generated</TableHead>
                    <TableHead className="w-16">Copy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {generatedLinks.map((link, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{link.email}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(link.generatedAt).toLocaleTimeString()}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => copyLink(link.url)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default AuthenticatedLinks;
