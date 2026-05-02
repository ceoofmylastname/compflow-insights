import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { supabase } from "@/integrations/supabase/client";
import { InviteAgentModal } from "@/components/agents/InviteAgentModal";
import { Mail, Plus, Check, Users } from "lucide-react";

interface Props {
  onNext: () => void;
  onBack: () => void;
}

export function Step4InviteAgents({ onNext, onBack }: Props) {
  const { data: currentAgent } = useCurrentAgent();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCount, setInviteCount] = useState<number>(0);
  const [agentCount, setAgentCount] = useState<number>(0);

  const refresh = async () => {
    if (!currentAgent?.tenant_id) return;
    const [inv, ag] = await Promise.all([
      supabase.from("invites").select("id", { count: "exact", head: true }).eq("tenant_id", currentAgent.tenant_id),
      supabase.from("agents").select("id", { count: "exact", head: true }).eq("tenant_id", currentAgent.tenant_id),
    ]);
    setInviteCount(inv.count ?? 0);
    setAgentCount(ag.count ?? 0);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentAgent?.tenant_id]);

  // Treat "owner only" (1 agent in the tenant) as zero invited downline.
  const downlineSize = Math.max(0, agentCount - 1);
  const hasInvites = inviteCount > 0 || downlineSize > 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">Invite your team</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add agents now or skip and do it later. Skipping queues a reminder on your home page.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground">Send an invite link</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Each invite generates a unique signup link you share with the agent. They claim the
              account and land in your hierarchy automatically.
            </p>
            <Button className="mt-3" onClick={() => setInviteOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Invite an agent
            </Button>
          </div>
        </div>
      </div>

      {hasInvites && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-sm text-foreground">
            <span className="font-medium">
              {inviteCount} invite{inviteCount === 1 ? "" : "s"} created
            </span>
            {downlineSize > 0 && (
              <span className="text-muted-foreground">
                {" · "}
                {downlineSize} agent{downlineSize === 1 ? "" : "s"} on board
              </span>
            )}
          </p>
        </div>
      )}

      <div className="rounded-md bg-muted/30 border border-border p-4">
        <div className="flex items-start gap-3">
          <Users className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1.5">
            <p>
              <span className="font-medium text-foreground">Why this matters:</span> agents need to
              be in the system before you upload carrier statements. Otherwise rows route to whoever
              ran the upload (you).
            </p>
            <p>
              You can also bulk-invite from the Agent Roster page using a CSV.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onNext}>Skip for now</Button>
          <Button onClick={onNext}>Continue</Button>
        </div>
      </div>

      <InviteAgentModal
        open={inviteOpen}
        onOpenChange={(v) => {
          setInviteOpen(v);
          if (!v) refresh();
        }}
      />
    </div>
  );
}
