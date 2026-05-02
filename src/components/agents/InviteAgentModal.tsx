import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { usePositionOptions } from "@/hooks/usePositions";
import { useAgents } from "@/hooks/useAgents";
import { useAgentCapStatus } from "@/hooks/useAgentCapStatus";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Check, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

interface InviteAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteAgentModal({ open, onOpenChange }: InviteAgentModalProps) {
  const [email, setEmail] = useState("");
  const [positionId, setPositionId] = useState("");
  const [contractType, setContractType] = useState("Direct Pay");
  const [annualGoal, setAnnualGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { data: currentAgent } = useCurrentAgent();
  const { positionOptions } = usePositionOptions();
  const { data: agents } = useAgents();
  const { data: capStatus } = useAgentCapStatus();
  const queryClient = useQueryClient();

  // Determine inviter role: owner, manager (has downline), or agent
  const isOwner = currentAgent?.is_owner === true;
  const isManager = !isOwner && (agents ?? []).some(
    (a) => a.upline_email === currentAgent?.email
  );
  const canAssignManager = isOwner || isManager;

  const handleSubmit = async () => {
    if (!email || !currentAgent) return;
    if (capStatus?.at_cap) {
      toast.error(
        `Your ${capStatus.tier ?? "current"} plan caps you at ${capStatus.cap} agents. Upgrade to add more.`
      );
      return;
    }
    setLoading(true);
    try {
      const token = crypto.randomUUID();
      const { error } = await supabase.from("invites").insert({
        tenant_id: currentAgent.tenant_id,
        invited_by_agent_id: currentAgent.id,
        invitee_email: email,
        invitee_upline_email: currentAgent.email,
        token,
      });
      if (error) throw error;

      // Pre-create placeholder agent record so signup can "claim" it.
      // Position is recorded via agent_position_history (FK), not on the
      // agents row.
      const startDate = new Date().toISOString().split("T")[0];
      const { data: insertedAgent, error: agentError } = await supabase
        .from("agents")
        .insert({
          tenant_id: currentAgent.tenant_id,
          email,
          first_name: "",
          last_name: "",
          contract_type: contractType,
          annual_goal: annualGoal ? parseFloat(annualGoal) : null,
          upline_email: currentAgent.email,
          is_owner: false,
          start_date: startDate,
        } as any)
        .select("id")
        .maybeSingle();

      if (agentError) {
        console.warn("Agent pre-create failed (may already exist):", agentError.message);
      } else if (insertedAgent && positionId) {
        // Record the agent's starting position assignment
        const { error: histError } = await supabase
          .from("agent_position_history" as any)
          .insert({
            tenant_id: currentAgent.tenant_id,
            agent_id: insertedAgent.id,
            position_id: positionId,
            upline_email: currentAgent.email,
            start_date: startDate,
          });
        if (histError) console.warn("Position history insert failed:", histError.message);
      }

      const appHost = import.meta.env.VITE_APP_HOSTNAME || "baseshophq.com";
      const url = `https://${appHost}/signup?invite=${token}`;
      setInviteUrl(url);
      toast.success(`Invite created for ${email}`);
      queryClient.invalidateQueries({ queryKey: ["invites"] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setInviteUrl(null);
      setEmail("");
      setPositionId("");
      setAnnualGoal("");
      setCopied(false);
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Agent</DialogTitle>
        </DialogHeader>
        {inviteUrl ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share this link with <strong>{email}</strong> to join your team:
            </p>
            <div className="flex gap-2">
              <Input value={inviteUrl} readOnly className="text-xs" />
              <Button size="icon" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button variant="outline" className="w-full" onClick={() => { setInviteUrl(null); setEmail(""); }}>
              Invite Another
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {capStatus && capStatus.cap !== null && (capStatus.near_cap || capStatus.at_cap) && (
              <div
                className={
                  capStatus.at_cap
                    ? "rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex gap-2 items-start"
                    : "rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 p-3 flex gap-2 items-start"
                }
              >
                <AlertTriangle className={capStatus.at_cap ? "h-4 w-4 text-destructive shrink-0 mt-0.5" : "h-4 w-4 text-amber-600 shrink-0 mt-0.5"} />
                <div className="text-xs">
                  <p className="font-semibold">
                    {capStatus.at_cap
                      ? `Agent cap reached (${capStatus.current}/${capStatus.cap}).`
                      : `Approaching agent cap (${capStatus.current}/${capStatus.cap}).`}
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    {capStatus.at_cap
                      ? "Upgrade your plan to invite more agents."
                      : `${capStatus.remaining} seat${capStatus.remaining === 1 ? "" : "s"} remaining on the ${capStatus.tier} plan.`}
                  </p>
                  <Link
                    to="/settings?tab=billing"
                    className="text-primary underline mt-1 inline-block"
                    onClick={() => onOpenChange(false)}
                  >
                    Manage plan
                  </Link>
                </div>
              </div>
            )}
            <div>
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@email.com" type="email" />
            </div>
            <div>
              <Label>Position</Label>
              <Select value={positionId} onValueChange={setPositionId} disabled={positionOptions.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={positionOptions.length === 0 ? "No positions defined yet" : "Select position"} />
                </SelectTrigger>
                <SelectContent>
                  {positionOptions
                    .filter((po) => canAssignManager || po.title.toLowerCase() !== "manager")
                    .map((po) => (
                      <SelectItem key={po.id} value={po.id}>{po.title}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Contract Type</Label>
              <Select value={contractType} onValueChange={setContractType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Direct Pay">Direct Pay</SelectItem>
                  <SelectItem value="LOA">LOA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Annual Goal</Label>
              <Input value={annualGoal} onChange={(e) => setAnnualGoal(e.target.value)} placeholder="$100,000" type="number" />
            </div>
            <p className="text-xs text-muted-foreground">A shareable invite link will be generated for you to copy and send to the agent.</p>
            <Button className="w-full" onClick={handleSubmit} disabled={loading || !email}>
              {loading ? "Creating..." : "Create Invite Link"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
