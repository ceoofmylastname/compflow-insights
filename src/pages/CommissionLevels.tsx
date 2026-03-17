import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useCommissionLevels, CommissionLevel } from "@/hooks/useCommissionLevels";
import { formatPercent, formatDate } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Download, Search, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CSVImportModal } from "@/components/shared/CSVImportModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadCSV, rowsToCSV } from "@/lib/csv-utils";
import { useCarrierOptions } from "@/hooks/useCarrierOptions";

interface CarrierGroup {
  carrier: string;
  levels: CommissionLevel[];
  productCount: number;
  positionCount: number;
}

const CommissionLevels = () => {
  const { data: currentAgent } = useCurrentAgent();
  const { data: levels, isLoading, error, refetch } = useCommissionLevels();
  const queryClient = useQueryClient();
  const isOwner = currentAgent?.is_owner ?? false;

  const [importOpen, setImportOpen] = useState(false);
  const [editRow, setEditRow] = useState<CommissionLevel | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [carrierFilter, setCarrierFilter] = useState("");
  const [expandedCarriers, setExpandedCarriers] = useState<Set<string>>(new Set());

  // Inline add form state
  const [addCarrier, setAddCarrier] = useState("");
  const [addProduct, setAddProduct] = useState("");
  const [addPosition, setAddPosition] = useState("");
  const [addRate, setAddRate] = useState("");
  const [addDate, setAddDate] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  // Edit form state
  const [formCarrier, setFormCarrier] = useState("");
  const [formProduct, setFormProduct] = useState("");
  const [formPosition, setFormPosition] = useState("");
  const [formRate, setFormRate] = useState("");
  const [formDate, setFormDate] = useState("");
  const [saving, setSaving] = useState(false);

  const { carriers: allCarriers } = useCarrierOptions();

  // Filter + search
  const filteredLevels = useMemo(() => {
    let result = levels ?? [];
    if (carrierFilter && carrierFilter !== "all") {
      result = result.filter((l) => l.carrier === carrierFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.carrier.toLowerCase().includes(q) ||
          l.product.toLowerCase().includes(q) ||
          l.position.toLowerCase().includes(q)
      );
    }
    return result;
  }, [levels, carrierFilter, search]);

  // Group by carrier
  const carrierGroups = useMemo(() => {
    const map = new Map<string, CommissionLevel[]>();
    for (const l of filteredLevels) {
      const existing = map.get(l.carrier) ?? [];
      existing.push(l);
      map.set(l.carrier, existing);
    }
    const groups: CarrierGroup[] = [];
    for (const [carrier, items] of map) {
      groups.push({
        carrier,
        levels: items,
        productCount: new Set(items.map((i) => i.product)).size,
        positionCount: new Set(items.map((i) => i.position)).size,
      });
    }
    return groups.sort((a, b) => a.carrier.localeCompare(b.carrier));
  }, [filteredLevels]);

  const toggleCarrier = (carrier: string) => {
    setExpandedCarriers((prev) => {
      const next = new Set(prev);
      if (next.has(carrier)) next.delete(carrier);
      else next.add(carrier);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedCarriers(new Set(carrierGroups.map((g) => g.carrier)));
  };

  const collapseAll = () => {
    setExpandedCarriers(new Set());
  };

  const openEdit = (row: CommissionLevel) => {
    setEditRow(row);
    setFormCarrier(row.carrier);
    setFormProduct(row.product);
    setFormPosition(row.position);
    setFormRate((row.rate * 100).toFixed(2));
    setFormDate(row.start_date);
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      const rateNum = parseFloat(formRate) / 100;
      const { error } = await supabase.from("commission_levels").update({
        carrier: formCarrier, product: formProduct, position: formPosition, rate: rateNum, start_date: formDate,
      }).eq("id", editRow.id);
      if (error) throw error;
      toast.success("Rate updated");
      queryClient.invalidateQueries({ queryKey: ["commissionLevels"] });
      setEditOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleInlineAdd = async () => {
    if (!currentAgent || !addCarrier.trim() || !addProduct.trim() || !addPosition.trim() || !addRate || !addDate) return;
    setAddSaving(true);
    try {
      const rateNum = parseFloat(addRate) / 100;
      const { error } = await supabase.from("commission_levels").insert({
        tenant_id: currentAgent.tenant_id,
        carrier: addCarrier.trim(),
        product: addProduct.trim(),
        position: addPosition.trim(),
        rate: rateNum,
        start_date: addDate,
      });
      if (error) throw error;
      toast.success("Rate added");
      queryClient.invalidateQueries({ queryKey: ["commissionLevels"] });
      setAddCarrier("");
      setAddProduct("");
      setAddPosition("");
      setAddRate("");
      setAddDate("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAddSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this rate?")) return;
    const { error } = await supabase.from("commission_levels").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Rate deleted");
    queryClient.invalidateQueries({ queryKey: ["commissionLevels"] });
  };

  const handleExport = () => {
    const headers = ["Carrier", "Product", "Position", "Rate (%)", "Effective Date"];
    const rows = filteredLevels.map((l) => [
      l.carrier,
      l.product,
      l.position,
      (l.rate * 100).toFixed(2),
      l.start_date,
    ]);
    downloadCSV("commission-levels.csv", rowsToCSV(headers, rows));
    toast.success("Exported to commission-levels.csv");
  };

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Commission Levels</h1>
          {isOwner && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredLevels.length === 0}>
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>Import CSV</Button>
            </div>
          )}
        </div>

        {/* Search + filter bar */}
        <div className="card-elevated p-3 flex flex-wrap gap-3 items-center">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search carrier, product, position..."
              className="pl-9"
            />
          </div>
          <Select value={carrierFilter} onValueChange={setCarrierFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All Carriers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Carriers</SelectItem>
              {allCarriers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-1 text-xs">
            <Button variant="ghost" size="sm" onClick={expandAll}>Expand All</Button>
            <Button variant="ghost" size="sm" onClick={collapseAll}>Collapse All</Button>
          </div>
        </div>

        {/* Inline add form (owner only) */}
        {isOwner && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Add New Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="w-40">
                  <Label className="text-xs">Carrier</Label>
                  <Input value={addCarrier} onChange={(e) => setAddCarrier(e.target.value)} placeholder="Carrier" className="h-8 text-sm" />
                </div>
                <div className="w-40">
                  <Label className="text-xs">Product</Label>
                  <Input value={addProduct} onChange={(e) => setAddProduct(e.target.value)} placeholder="Product" className="h-8 text-sm" />
                </div>
                <div className="w-32">
                  <Label className="text-xs">Position</Label>
                  <Input value={addPosition} onChange={(e) => setAddPosition(e.target.value)} placeholder="Position" className="h-8 text-sm" />
                </div>
                <div className="w-24">
                  <Label className="text-xs">Rate (%)</Label>
                  <Input value={addRate} onChange={(e) => setAddRate(e.target.value)} placeholder="127.00" className="h-8 text-sm" />
                </div>
                <div className="w-36">
                  <Label className="text-xs">Effective Date</Label>
                  <Input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className="h-8 text-sm" />
                </div>
                <Button
                  size="sm"
                  onClick={handleInlineAdd}
                  disabled={addSaving || !addCarrier.trim() || !addProduct.trim() || !addPosition.trim() || !addRate || !addDate}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {addSaving ? "Adding..." : "Add"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <SkeletonTable columns={5} />
        ) : carrierGroups.length === 0 ? (
          <EmptyState
            title="No commission rates"
            description={search || carrierFilter ? "No rates match your filters." : "Add commission rate schedules to calculate agent commissions."}
            action={isOwner ? { label: "Import CSV", onClick: () => setImportOpen(true) } : undefined}
          />
        ) : (
          <div className="space-y-2">
            {carrierGroups.map((group) => {
              const isExpanded = expandedCarriers.has(group.carrier);
              return (
                <div key={group.carrier} className="card-elevated overflow-hidden">
                  {/* Carrier header row */}
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleCarrier(group.carrier)}
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-semibold text-foreground">{group.carrier}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{group.levels.length} rates</span>
                      <span>{group.productCount} products</span>
                      <span>{group.positionCount} positions</span>
                    </div>
                  </div>

                  {/* Expanded table */}
                  {isExpanded && (
                    <div className="border-t border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>Position</TableHead>
                            <TableHead>Rate</TableHead>
                            <TableHead>Effective Date</TableHead>
                            {isOwner && <TableHead className="w-20">Actions</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.levels.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell>{l.product}</TableCell>
                              <TableCell>{l.position}</TableCell>
                              <TableCell className="font-mono">{formatPercent(l.rate)}</TableCell>
                              <TableCell>{formatDate(l.start_date)}</TableCell>
                              {isOwner && (
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(l)}>
                                      Edit
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() => handleDelete(l.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CSVImportModal open={importOpen} onOpenChange={setImportOpen} defaultTab="commissions" />

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Rate</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Carrier</Label><Input value={formCarrier} onChange={(e) => setFormCarrier(e.target.value)} /></div>
            <div><Label>Product</Label><Input value={formProduct} onChange={(e) => setFormProduct(e.target.value)} /></div>
            <div><Label>Position</Label><Input value={formPosition} onChange={(e) => setFormPosition(e.target.value)} /></div>
            <div><Label>Rate (%)</Label><Input value={formRate} onChange={(e) => setFormRate(e.target.value)} placeholder="127.00" /></div>
            <div><Label>Effective Date</Label><Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} /></div>
            <Button className="w-full" onClick={handleEditSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default CommissionLevels;
