import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAgents, type Agent } from "@/hooks/useAgents";
import { computeDownlineAgentIds } from "@/lib/downline";
import { formatDate } from "@/lib/formatters";
import { toast } from "sonner";

interface ReassignUplineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: Agent | null;
}

export function ReassignUplineModal({ open, onOpenChange, agent }: ReassignUplineModalProps) {
  const { data: agents } = useAgents();
  const queryClient = useQueryClient();
  const [newUplineEmail, setNewUplineEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Pull the agent's currently-open agent_position_history row so the
  // "Currently reports to: ... (since X)" display reflects the time-stamped
  // truth rather than just the denormalized agents.upline_email cache.
  const { data: openHistoryRow } = useQuery({
    queryKey: ["openHistoryRow", agent?.id],
    queryFn: async () => {
      if (!agent?.id) return null;
      const { data, error } = await supabase
        .from("agent_position_history" as any)
        .select("start_date, upline_email")
        .eq("agent_id", agent.id)
        .is("end_date", null)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { start_date: string; upline_email: string | null } | null;
    },
    enabled: !!agent?.id && open,
  });

  const currentUpline = useMemo(() => {
    const email = openHistoryRow?.upline_email ?? agent?.upline_email ?? null;
    if (!email) return null;
    return agents?.find((a) => a.email === email) ?? null;
  }, [openHistoryRow, agent, agents]);

  // Cycle prevention: anyone in the agent's downline is ineligible. Plus the
  // agent themselves. The picker filters to eligible candidates so the only
  // way to fail is "same as current upline" — caught at submit.
  const downlineIds = useMemo(() => {
    if (!agent?.email || !agents) return new Set<string>();
    return computeDownlineAgentIds(agent.email, agents);
  }, [agent, agents]);

  const eligibleUplines = useMemo(() => {
    if (!agents || !agent) return [];
    return agents
      .filter((a) => a.id !== agent.id && !downlineIds.has(a.id))
      .sort((a, b) => `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`));
  }, [agents, agent, downlineIds]);

  const reset = () => {
    setNewUplineEmail("");
    setSubmitting(false);
  };

  const handleReassign = async () => {
    if (!agent || !newUplineEmail) return;
    if (currentUpline && newUplineEmail === currentUpline.email) {
      toast.error("That's already their upline");
      return;
    }
    // Defensive cycle re-check (the picker excludes downline, but data may
    // have changed between mount and submit).
    const target = agents?.find((a) => a.email === newUplineEmail);
    if (target && downlineIds.has(target.id)) {
      toast.error(`Cannot create a cycle: ${target.first_name} ${target.last_name} reports up through ${agent.first_name} ${agent.last_name}.`);
      return;
    }
    if (target?.id === agent.id) {
      toast.error("An agent cannot be their own upline");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc(
        "reassign_agent_upline" as any,
        {
          p_agent_id: agent.id,
          p_new_upline_email: newUplineEmail,
        }
      );
      if (error) throw error;

      const newUpline = agents?.find((a) => a.email === newUplineEmail);
      toast.success(
        `Upline reassigned. ${agent.first_name} ${agent.last_name} now reports to ${newUpline?.first_name ?? ""} ${newUpline?.last_name ?? ""}.`.trim()
      );
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["openHistoryRow"] });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to reassign upline");
    } finally {
      setSubmitting(false);
    }
  };

  if (!agent) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent
        className="
          w-[calc(100vw-1rem)] max-w-none rounded-lg p-4
          md:max-w-lg md:p-6
        "
      >
        <DialogHeader>
          <DialogTitle>
            Reassign Upline for {agent.first_name} {agent.last_name}
          </DialogTitle>
          <DialogDescription>
            This change applies going forward. Commissions on policies written before today still credit the previous upline chain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Currently reports to</Label>
            <p className="text-sm">
              {currentUpline ? (
                <>
                  <span className="font-medium">
                    {currentUpline.first_name} {currentUpline.last_name}
                  </span>
                  {openHistoryRow?.start_date && (
                    <span className="text-muted-foreground ml-2">
                      (since {formatDate(openHistoryRow.start_date)})
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">No recorded upline</span>
              )}
            </p>
          </div>

          <div>
            <Label className="text-xs">Reassign to</Label>
            <Select
              value={newUplineEmail}
              onValueChange={setNewUplineEmail}
              disabled={eligibleUplines.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    eligibleUplines.length === 0
                      ? "No eligible uplines (every agent is in this agent's downline)"
                      : "Select new upline"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {eligibleUplines.map((a) => (
                  <SelectItem key={a.id} value={a.email}>
                    {a.first_name} {a.last_name}
                    {a.is_owner ? " (Owner)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Effective</Label>
            <p className="text-sm">{formatDate(new Date().toISOString().split("T")[0])}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleReassign} disabled={!newUplineEmail || submitting}>
            {submitting ? "Reassigning..." : "Reassign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
