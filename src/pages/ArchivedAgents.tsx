import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useArchivedAgents, useRestoreAgent, Agent } from "@/hooks/useAgents";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { formatDate } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Archive, RotateCcw } from "lucide-react";

const ArchivedAgents = () => {
  const { data: currentAgent } = useCurrentAgent();
  const { data: archivedAgents, isLoading, error, refetch } = useArchivedAgents();
  const restoreAgent = useRestoreAgent();
  const isOwner = currentAgent?.is_owner ?? false;

  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!archivedAgents) return [];
    if (!search) return archivedAgents;
    const s = search.toLowerCase();
    return archivedAgents.filter((a) =>
      `${a.first_name} ${a.last_name} ${a.email}`.toLowerCase().includes(s)
    );
  }, [archivedAgents, search]);

  const handleRestore = (agent: Agent) => {
    if (!confirm(`Restore ${agent.first_name} ${agent.last_name}?`)) return;
    restoreAgent.mutate(agent.id);
  };

  const columns: Column<Agent>[] = [
    { key: "name", label: "Full Name", render: (r) => `${r.first_name} ${r.last_name}` },
    { key: "email", label: "Email" },
    { key: "position", label: "Position" },
    { key: "contract_type", label: "Contract Type" },
    { key: "archived_at", label: "Archived On", render: (r) => formatDate(r.archived_at) },
    ...(isOwner ? [{
      key: "actions" as keyof Agent,
      label: "Actions",
      sortable: false,
      render: (r: Agent) => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => handleRestore(r)}
          disabled={restoreAgent.isPending}
        >
          <RotateCcw className="h-3 w-3 mr-1" /> Restore
        </Button>
      ),
    }] : []),
  ];

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Archived Agents</h1>
            <p className="text-sm text-muted-foreground">
              Archived agents are excluded from active reports but preserved for historical data.
            </p>
          </div>
        </div>

        <div className="card-elevated p-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search archived agents..."
            className="w-64"
          />
        </div>

        {isLoading ? (
          <SkeletonTable columns={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No archived agents"
            description="Archived agents will appear here. Use the Agent Roster to archive an agent."
            icon={<Archive className="h-10 w-10 text-muted-foreground" />}
          />
        ) : (
          <DataTable columns={columns} data={filtered} pageSize={25} />
        )}
      </div>
    </AppLayout>
  );
};

export default ArchivedAgents;
