import { usePolicies } from "@/hooks/usePolicies";
import { useAgents } from "@/hooks/useAgents";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function RecentPolicies() {
  const { data: policies, isLoading, error, refetch } = usePolicies({ limit: 10 });
  const { data: agents } = useAgents();

  const getAgentName = (id: string | null) => {
    if (!id) return "--";
    const agent = agents?.find((a) => a.id === id);
    return agent ? `${agent.first_name} ${agent.last_name}` : "--";
  };

  if (error) return <ErrorBanner message={(error as Error).message} onRetry={refetch} />;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">Recent Policies</h3>
      {isLoading ? (
        <SkeletonTable columns={7} rows={5} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Client Name</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Annual Premium</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Writing Agent</TableHead>
                <TableHead>Application Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies && policies.length > 0 ? (
                policies.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.client_name || "--"}</TableCell>
                    <TableCell>{p.carrier || "--"}</TableCell>
                    <TableCell>{p.product || "--"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.annual_premium)}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell>{getAgentName(p.resolved_agent_id)}</TableCell>
                    <TableCell>{formatDate(p.application_date)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No policies yet. Import a CSV to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
