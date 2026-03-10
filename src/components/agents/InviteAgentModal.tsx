import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
  const { data: currentAgent } = useCurrentAgent();
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
      toast.success(`Invite sent to ${email}`);
      queryClient.invalidateQueries({ queryKey: ["invites"] });
      setEmail("");
      setPosition("");
      setAnnualGoal("");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Agent</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@email.com" type="email" />
          </div>
          <div>
            <Label>Position</Label>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Agent, Manager" />
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
          <Button className="w-full" onClick={handleSubmit} disabled={loading || !email}>
            {loading ? "Sending..." : "Send Invite"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
