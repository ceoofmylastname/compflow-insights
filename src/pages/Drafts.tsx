import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useDrafts, DraftPolicy } from "@/hooks/useDrafts";
import { useAgents } from "@/hooks/useAgents";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { QUERY_KEYS } from "@/lib/query-keys";
import { FileEdit, Send, Trash2 } from "lucide-react";
import { calculateAndSavePayouts } from "@/lib/commission-engine";

const Drafts = () => {
  const { data: drafts, isLoading, error, refetch } = useDrafts();
  const { data: agents } = useAgents();
  const queryClient = useQueryClient();
  const [publishing, setPublishing] = useState<string | null>(null);

  const getAgentName = (id: string | null) => {
    const a = agents?.find((x) => x.id === id);
    return a ? `${a.first_name} ${a.last_name}` : "--";
  };

  const handlePublish = async (draft: DraftPolicy) => {
    setPublishing(draft.id);
    try {
      const { error } = await supabase
        .from("policies")
        .update({ is_draft: false, draft_saved_at: null } as any)
        .eq("id", draft.id);
      if (error) throw error;
      try {
        await calculateAndSavePayouts(draft.id, supabase);
      } catch {}
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.drafts] });
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["commissionPayouts"] });
      toast.success("Draft published as policy");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPublishing(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this draft permanently?")) return;
    const { error } = await supabase.from("policies").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.drafts] });
    toast.success("Draft deleted");
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
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs"
            onClick={() => handlePublish(r)}
            disabled={publishing === r.id}
          >
            <Send className="h-3 w-3 mr-1" />
            {publishing === r.id ? "Publishing..." : "Publish"}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => handleDelete(r.id)}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Drafts</h1>
            <p className="text-sm text-muted-foreground">
              Saved drafts that haven't been published yet. Drafts are excluded from all production reports.
            </p>
          </div>
        </div>

        {isLoading ? (
          <SkeletonTable columns={7} />
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
    </AppLayout>
  );
};

export default Drafts;
