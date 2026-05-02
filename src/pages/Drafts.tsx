import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useDrafts, DraftPolicy } from "@/hooks/useDrafts";
import { useAgents } from "@/hooks/useAgents";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { QUERY_KEYS } from "@/lib/query-keys";
import { FileEdit, Send, Trash2, Pencil } from "lucide-react";
import { calculateAndSavePayouts } from "@/lib/commission-engine";
import { PostDealModal } from "@/components/policies/PostDealModal";
import type { Policy } from "@/hooks/usePolicies";

interface PromoteValidation {
  ok: boolean;
  missing: string[];
}

function validateForPromotion(d: DraftPolicy): PromoteValidation {
  const missing: string[] = [];
  if (!d.policy_number?.trim()) missing.push("Policy Number");
  if (!d.application_date) missing.push("Application Date");
  if (!d.client_name?.trim()) missing.push("Client Name");
  if (!d.carrier?.trim()) missing.push("Carrier");
  if (!d.product?.trim()) missing.push("Product");
  if (!d.annual_premium || Number(d.annual_premium) <= 0) {
    missing.push("Annual Premium");
  }
  if (!d.contract_type) missing.push("Contract Type");
  return { ok: missing.length === 0, missing };
}

const Drafts = () => {
  const { data: drafts, isLoading, error, refetch } = useDrafts();
  const { data: agents } = useAgents();
  const { data: currentAgent } = useCurrentAgent();
  const queryClient = useQueryClient();
  const [promoting, setPromoting] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<Policy | null>(null);

  const getAgentName = (id: string | null) => {
    const a = agents?.find((x) => x.id === id);
    return a ? `${a.first_name} ${a.last_name}` : "(unknown)";
  };

  const handlePromote = async (draft: DraftPolicy) => {
    const v = validateForPromotion(draft);
    if (!v.ok) {
      toast.error(
        `Missing required fields before this draft can be submitted: ${v.missing.join(", ")}. Open the draft to fill them in.`
      );
      return;
    }
    setPromoting(draft.id);
    try {
      const { error } = await supabase
        .from("policies")
        .update({ status: "Submitted", is_draft: false, draft_saved_at: null } as any)
        .eq("id", draft.id);
      if (error) throw error;
      try {
        await calculateAndSavePayouts(draft.id, supabase);
      } catch {}

      // Fire policy.submitted webhook on the Draft -> Submitted transition.
      // Per Wiki/webhooks-and-culture-tools.md the Draft state itself fires
      // nothing; the lifecycle event lands here when the agent promotes.
      if (currentAgent) {
        try {
          const { data: hooks } = await supabase
            .from("webhook_configs")
            .select("webhook_url")
            .eq("tenant_id", currentAgent.tenant_id)
            .eq("is_active", true)
            .eq("event_type", "policy.submitted" as any);

          const agent = agents?.find((a) => a.id === draft.resolved_agent_id);
          for (const config of (hooks ?? []) as Array<{ webhook_url: string }>) {
            await supabase.functions.invoke("fire-webhook", {
              body: {
                webhook_url: config.webhook_url,
                payload: {
                  event: "policy.submitted",
                  policy_number: draft.policy_number || "",
                  client_name: draft.client_name || "",
                  carrier: draft.carrier || "",
                  product: draft.product || "",
                  annual_premium: draft.annual_premium || 0,
                  agent_email: agent?.email || "",
                  application_date: draft.application_date || "",
                  status: "Submitted",
                },
              },
            });
          }
        } catch {}
      }

      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.drafts] });
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["commissionPayouts"] });
      toast.success("Draft promoted to Submitted");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPromoting(null);
    }
  };

  const handleDiscard = async (id: string) => {
    if (!confirm("Discard this draft? This cannot be undone.")) return;
    const { error } = await supabase.from("policies").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.drafts] });
    toast.success("Draft discarded");
  };

  const columns: Column<DraftPolicy>[] = [
    { key: "client_name", label: "Client Name" },
    { key: "carrier", label: "Carrier" },
    { key: "product", label: "Product" },
    { key: "policy_number", label: "Policy Number" },
    {
      key: "annual_premium",
      label: "Annual Premium",
      render: (r) => formatCurrency(r.annual_premium),
      getValue: (r) => r.annual_premium,
    },
    {
      key: "resolved_agent_id",
      label: "Writing Agent",
      render: (r) => getAgentName(r.resolved_agent_id),
    },
    {
      key: "draft_saved_at",
      label: "Saved At",
      render: (r) => formatDate(r.draft_saved_at),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (r) => (
        <div className="flex gap-1 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => setEditingDraft(r as unknown as Policy)}
          >
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="default"
            className="h-8 text-xs"
            onClick={() => handlePromote(r)}
            disabled={promoting === r.id}
          >
            <Send className="h-3.5 w-3.5 mr-1" />
            {promoting === r.id ? "Promoting..." : "Promote"}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => handleDiscard(r.id)}
            title="Discard draft"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  if (error) {
    return (
      <AppLayout>
        <ErrorBanner message={(error as Error).message} onRetry={refetch} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Drafts</h1>
            <p className="text-sm text-muted-foreground">
              Drafts are private to you. They do not count toward commissions, payroll, leaderboards, or active-agent billing until you promote them.
            </p>
          </div>
        </div>

        {isLoading ? (
          <SkeletonTable columns={8} />
        ) : !drafts || drafts.length === 0 ? (
          <EmptyState
            title="No drafts"
            description="Save a deal as draft from Post a Deal to see it here."
            icon={<FileEdit className="h-10 w-10 text-muted-foreground" />}
          />
        ) : (
          <DataTable columns={columns} data={drafts} pageSize={25} />
        )}
      </div>

      <PostDealModal
        open={!!editingDraft}
        onOpenChange={(v) => {
          if (!v) setEditingDraft(null);
        }}
        editingPolicy={editingDraft}
      />
    </AppLayout>
  );
};

export default Drafts;
