import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useAgentContracts, AgentContract } from "@/hooks/useAgentContracts";
import { useAgents } from "@/hooks/useAgents";
import { useCarrierOptions } from "@/hooks/useCarrierOptions";
import { formatDate } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { downloadCSV, rowsToCSV } from "@/lib/csv-utils";
import { toast } from "sonner";

const Contracts = () => {
  const { data: allContracts, isLoading, error, refetch } = useAgentContracts("all");
  const { data: agents } = useAgents();
  const { carriers } = useCarrierOptions();

  const [search, setSearch] = useState("");
  const [carrierFilter, setCarrierFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const getAgentName = (agentId: string) => {
    const a = agents?.find((x) => x.id === agentId);
    return a ? `${a.first_name} ${a.last_name}` : "--";
  };

  const filtered = useMemo(() => {
    let result = allContracts ?? [];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((c) => {
        const name = getAgentName(c.agent_id).toLowerCase();
        return name.includes(s) || (c.carrier || "").toLowerCase().includes(s) || (c.agent_number || "").toLowerCase().includes(s);
      });
    }
    if (carrierFilter && carrierFilter !== "all") {
      result = result.filter((c) => c.carrier === carrierFilter);
    }
    if (typeFilter && typeFilter !== "all") {
      result = result.filter((c) => c.contract_type === typeFilter);
    }
    if (statusFilter && statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }
    return result;
  }, [allContracts, search, carrierFilter, typeFilter, statusFilter, agents]);

  const handleExport = () => {
    const headers = ["Agent", "Carrier", "Agent Number", "Contract Type", "Status", "Referral Code", "Start Date"];
    const rows = filtered.map((c) => [
      getAgentName(c.agent_id),
      c.carrier || "",
      c.agent_number || "",
      c.contract_type || "",
      c.status || "",
      c.referral_code || "",
      c.start_date || "",
    ]);
    downloadCSV("contracts.csv", rowsToCSV(headers, rows));
    toast.success("Contracts exported");
  };

  const columns: Column<AgentContract>[] = [
    { key: "agent_id", label: "Agent", render: (r) => getAgentName(r.agent_id) },
    { key: "carrier", label: "Carrier" },
    { key: "agent_number", label: "Agent Number", render: (r) => r.agent_number || "--" },
    { key: "contract_type", label: "Type", render: (r) => r.contract_type || "--" },
    {
      key: "status",
      label: "Status",
      render: (r) => (
        <Badge variant={r.status === "Active" ? "default" : "secondary"}>
          {r.status || "--"}
        </Badge>
      ),
    },
    { key: "referral_code", label: "Referral Code", render: (r) => r.referral_code || "--" },
    { key: "start_date", label: "Start Date", render: (r) => formatDate(r.start_date) },
  ];

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Contracts</h1>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>

        <div className="card-elevated p-3 flex flex-wrap gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agent, carrier, or number..."
            className="w-64"
          />
          <Select value={carrierFilter} onValueChange={setCarrierFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Carriers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Carriers</SelectItem>
              {carriers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Direct Pay">Direct Pay</SelectItem>
              <SelectItem value="LOA">LOA</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <SkeletonTable columns={7} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No contracts found"
            description="Carrier contracts will appear here when agents have writing numbers assigned."
          />
        ) : (
          <DataTable columns={columns} data={filtered} pageSize={25} />
        )}
      </div>
    </AppLayout>
  );
};

export default Contracts;
