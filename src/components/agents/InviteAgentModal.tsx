import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { usePositionOptions } from "@/hooks/usePositions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";

interface InviteAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteAgentModal({ open, onOpenChange }: InviteAgentModalProps) {
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [contractType, setContractType] = useState("Direct Pay");
  const [annualGoal, setAnnualGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { data: currentAgent } = useCurrentAgent();
  const { positions: positionOptions } = usePositionOptions();
  const queryClient = useQueryClient();

  const handleSubmit = async () => {
    if (!email || !currentAgent) return;
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

      // Pre-create placeholder agent record so signup can "claim" it
      const { error: agentError } = await supabase.from("agents").insert({
        tenant_id: currentAgent.tenant_id,
        email,
        first_name: "",
        last_name: "",
        position: position || null,
        contract_type: contractType,
        annual_goal: annualGoal ? parseFloat(annualGoal) : null,
        upline_email: currentAgent.email,
        is_owner: false,
        start_date: new Date().toISOString().split("T")[0],
      });
      if (agentError) console.warn("Agent pre-create failed (may already exist):", agentError.message);

      const url = `${window.location.origin}/signup?invite=${token}`;
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
      setPosition("");
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
            <div>
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@email.com" type="email" />
            </div>
            <div>
              <Label>Position</Label>
              {positionOptions.length > 0 ? (
                <Select value={position} onValueChange={setPosition}>
                  <SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger>
                  <SelectContent>
                    {positionOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Agent, Manager" />
              )}
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
