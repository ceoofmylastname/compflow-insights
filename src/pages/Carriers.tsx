import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useCarriers,
  useCreateCarrier,
  useUpdateCarrier,
  useDeleteCarrier,
  useCreateCarrierProduct,
  useDeleteCarrierProduct,
} from "@/hooks/useCarriers";
import { useAgents } from "@/hooks/useAgents";
import { useAgentContracts, useCreateAgentContract } from "@/hooks/useAgentContracts";
import { usePolicies, getPoliciesArray } from "@/hooks/usePolicies";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ChevronDown, ChevronRight, Trash2, Plus, Building2, Package, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const Carriers = () => {
  const { data: currentAgent } = useCurrentAgent();
  const { data: carriers, isLoading } = useCarriers();
  const createCarrier = useCreateCarrier();
  const updateCarrier = useUpdateCarrier();
  const deleteCarrier = useDeleteCarrier();
  const createProduct = useCreateCarrierProduct();
  const deleteProduct = useDeleteCarrierProduct();
  const { data: agents } = useAgents();
  const { data: allContracts } = useAgentContracts("all");
  const createContract = useCreateAgentContract();
  const { data: policiesRaw } = usePolicies({});
  const policies = getPoliciesArray(policiesRaw);
  const queryClient = useQueryClient();

  const isOwner = currentAgent?.is_owner ?? false;

  const [search, setSearch] = useState("");
  const [newCarrierName, setNewCarrierName] = useState("");
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [showWritingNumbers, setShowWritingNumbers] = useState(false);

  // Product add form state per carrier
  const [productForms, setProductForms] = useState<Record<string, { name: string; type: string }>>({});

  // Writing number edits
  const [writingEdits, setWritingEdits] = useState<Record<string, string>>({});
  const [savingWriting, setSavingWriting] = useState(false);

  // Carrier stats from policies
  const carrierStats = useMemo(() => {
    const map = new Map<string, { policyCount: number; totalPremium: number; agentIds: Set<string> }>();
    for (const p of policies) {
      if (!p.carrier) continue;
      if (!map.has(p.carrier)) {
        map.set(p.carrier, { policyCount: 0, totalPremium: 0, agentIds: new Set() });
      }
      const s = map.get(p.carrier)!;
      s.policyCount++;
      s.totalPremium += p.annual_premium || 0;
      if (p.resolved_agent_id) s.agentIds.add(p.resolved_agent_id);
    }
    return map;
  }, [policies]);

  // Filter carriers
  const filteredCarriers = useMemo(() => {
    if (!carriers) return [];
    if (!search.trim()) return carriers;
    const q = search.toLowerCase();
    return carriers.filter((c) => c.name.toLowerCase().includes(q));
  }, [carriers, search]);

  // Active carriers for writing numbers matrix
  const activeCarriers = useMemo(
    () => (carriers ?? []).filter((c) => c.status === "active"),
    [carriers]
  );

  // Team agents (exclude self)
  const teamAgents = useMemo(
    () => (agents ?? []).filter((a) => a.id !== currentAgent?.id),
    [agents, currentAgent]
  );

  // Contract lookup: "agentId|carrierName" → contract
  const contractMap = useMemo(() => {
    const map = new Map<string, { id: string; agent_number: string | null }>();
    for (const c of allContracts ?? []) {
      map.set(`${c.agent_id}|${c.carrier}`, { id: c.id, agent_number: c.agent_number });
    }
    return map;
  }, [allContracts]);

  const handleAddCarrier = () => {
    if (!newCarrierName.trim()) return;
    createCarrier.mutate({ name: newCarrierName.trim() }, {
      onSuccess: () => setNewCarrierName(""),
    });
  };

  const handleToggleStatus = (id: string, currentStatus: string) => {
    updateCarrier.mutate({ id, status: currentStatus === "active" ? "inactive" : "active" });
  };

  const handleDeleteCarrier = (id: string, name: string) => {
    if (!confirm(`Delete carrier "${name}" and all its products?`)) return;
    deleteCarrier.mutate(id);
  };

  const toggleProducts = (carrierId: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(carrierId)) next.delete(carrierId);
      else next.add(carrierId);
      return next;
    });
  };

  const handleAddProduct = (carrierId: string) => {
    const form = productForms[carrierId];
    if (!form?.name.trim()) return;
    createProduct.mutate(
      { carrier_id: carrierId, name: form.name.trim(), type: form.type.trim() || undefined },
      { onSuccess: () => setProductForms((p) => ({ ...p, [carrierId]: { name: "", type: "" } })) }
    );
  };

  const handleSaveWritingNumbers = async () => {
    if (!currentAgent) return;
    setSavingWriting(true);
    let saved = 0;
    try {
      for (const [key, value] of Object.entries(writingEdits)) {
        const [agentId, carrierName] = key.split("|");
        const existing = contractMap.get(key);
        const trimmed = value.trim();

        if (existing) {
          // Update existing contract
          if (trimmed !== (existing.agent_number || "")) {
            const { error } = await supabase
              .from("agent_contracts")
              .update({ agent_number: trimmed || null } as any)
              .eq("id", existing.id);
            if (error) throw error;
            saved++;
          }
        } else if (trimmed) {
          // Create new contract
          const { error } = await supabase.from("agent_contracts").insert({
            tenant_id: currentAgent.tenant_id,
            agent_id: agentId,
            carrier: carrierName,
            agent_number: trimmed,
            contract_type: "Direct Pay",
            status: "active",
          } as any);
          if (error) throw error;
          saved++;
        }
      }
      if (saved > 0) {
        queryClient.invalidateQueries({ queryKey: ["agentContracts"] });
        toast.success(`${saved} writing number(s) saved`);
      }
      setWritingEdits({});
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingWriting(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Carriers</h1>
            <p className="text-sm text-muted-foreground">
              Manage carriers, products, and agent writing numbers
            </p>
          </div>
        </div>

        {/* Search + Add Carrier */}
        <div className="card-elevated p-3 flex flex-wrap gap-3 items-center">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search carriers..."
              className="pl-9"
            />
          </div>
          {isOwner && (
            <div className="flex gap-2 ml-auto">
              <Input
                value={newCarrierName}
                onChange={(e) => setNewCarrierName(e.target.value)}
                placeholder="New carrier name"
                className="w-48"
                onKeyDown={(e) => e.key === "Enter" && handleAddCarrier()}
              />
              <Button
                size="sm"
                className="btn-primary-elevated"
                onClick={handleAddCarrier}
                disabled={createCarrier.isPending || !newCarrierName.trim()}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Carrier
              </Button>
            </div>
          )}
        </div>

        {/* Carrier Cards Grid */}
        {isLoading ? (
          <SkeletonTable />
        ) : filteredCarriers.length === 0 ? (
          <EmptyState
            title="No carriers found"
            description={search ? "No carriers match your search." : "Add your first carrier to get started."}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCarriers.map((carrier) => {
              const stats = carrierStats.get(carrier.name);
              const productCount = carrier.carrier_products?.length ?? 0;
              const isExpanded = expandedProducts.has(carrier.id);
              const form = productForms[carrier.id] || { name: "", type: "" };

              return (
                <div key={carrier.id} className="card-elevated overflow-hidden">
                  {/* Card Header */}
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-primary/10 p-2">
                          <Building2 className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{carrier.name}</h3>
                          <Badge
                            variant={carrier.status === "active" ? "default" : "secondary"}
                            className="text-[10px] mt-0.5"
                          >
                            {carrier.status}
                          </Badge>
                        </div>
                      </div>
                      {isOwner && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleToggleStatus(carrier.id, carrier.status)}
                            title={carrier.status === "active" ? "Deactivate" : "Activate"}
                          >
                            <span className="text-xs">{carrier.status === "active" ? "⏸" : "▶"}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleDeleteCarrier(carrier.id, carrier.name)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-muted/50 p-2">
                        <p className="text-lg font-bold text-foreground">{formatNumber(stats?.policyCount ?? 0)}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Policies</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-2">
                        <p className="text-lg font-bold text-foreground">{formatCurrency(stats?.totalPremium ?? 0)}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Premium</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-2">
                        <p className="text-lg font-bold text-foreground">{formatNumber(stats?.agentIds?.size ?? 0)}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Agents</p>
                      </div>
                    </div>
                  </div>

                  {/* Products Expandable Section */}
                  <div className="border-t border-border">
                    <button
                      className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
                      onClick={() => toggleProducts(carrier.id)}
                    >
                      <span className="flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5" />
                        Products ({productCount})
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border/50 px-4 pb-3">
                        {productCount > 0 ? (
                          <div className="space-y-1 py-2">
                            {carrier.carrier_products!.map((p) => (
                              <div key={p.id} className="flex items-center justify-between text-sm py-1">
                                <div>
                                  <span className="text-foreground">{p.name}</span>
                                  {p.type && (
                                    <Badge variant="outline" className="ml-2 text-[10px]">{p.type}</Badge>
                                  )}
                                </div>
                                {isOwner && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => deleteProduct.mutate(p.id)}
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground py-2">No products yet</p>
                        )}

                        {isOwner && (
                          <div className="flex gap-2 pt-2 border-t border-border/30">
                            <Input
                              value={form.name}
                              onChange={(e) =>
                                setProductForms((p) => ({ ...p, [carrier.id]: { ...form, name: e.target.value } }))
                              }
                              placeholder="Product name"
                              className="h-8 text-xs"
                            />
                            <Input
                              value={form.type}
                              onChange={(e) =>
                                setProductForms((p) => ({ ...p, [carrier.id]: { ...form, type: e.target.value } }))
                              }
                              placeholder="Type (optional)"
                              className="h-8 text-xs w-28"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs shrink-0"
                              onClick={() => handleAddProduct(carrier.id)}
                              disabled={!form.name.trim()}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Agent Writing Numbers Matrix (owner only) */}
        {isOwner && activeCarriers.length > 0 && (
          <div className="card-elevated overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setShowWritingNumbers((p) => !p)}
            >
              <div className="flex items-center gap-2">
                {showWritingNumbers ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-foreground">
                  Agent Writing Numbers
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {teamAgents.length} agents × {activeCarriers.length} carriers
              </p>
            </div>

            {showWritingNumbers && (
              <div className="border-t border-border">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2 border-border bg-gradient-to-r from-muted/60 to-muted/30">
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-9 sticky left-0 bg-card z-10">
                          Agent
                        </TableHead>
                        {activeCarriers.map((c) => (
                          <TableHead
                            key={c.id}
                            className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-9 min-w-[140px]"
                          >
                            {c.name}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamAgents.map((agent) => (
                        <TableRow key={agent.id} className="table-row-hover">
                          <TableCell className="font-medium text-sm sticky left-0 bg-card z-10">
                            {agent.first_name} {agent.last_name}
                          </TableCell>
                          {activeCarriers.map((c) => {
                            const key = `${agent.id}|${c.name}`;
                            const existing = contractMap.get(key);
                            const currentValue = writingEdits[key] ?? existing?.agent_number ?? "";
                            return (
                              <TableCell key={c.id} className="p-1">
                                <Input
                                  value={currentValue}
                                  onChange={(e) =>
                                    setWritingEdits((prev) => ({ ...prev, [key]: e.target.value }))
                                  }
                                  placeholder="—"
                                  className="h-7 text-xs font-mono"
                                />
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {Object.keys(writingEdits).length > 0 && (
                  <div className="px-4 py-3 border-t border-border flex justify-end">
                    <Button
                      size="sm"
                      className="btn-primary-elevated"
                      onClick={handleSaveWritingNumbers}
                      disabled={savingWriting}
                    >
                      {savingWriting ? "Saving..." : "Save Writing Numbers"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Carriers;
