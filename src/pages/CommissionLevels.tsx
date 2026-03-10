import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useCommissionLevels, CommissionLevel } from "@/hooks/useCommissionLevels";
import { formatPercent, formatDate } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CSVImportModal } from "@/components/shared/CSVImportModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const CommissionLevels = () => {
  const { data: currentAgent } = useCurrentAgent();
  const { data: levels, isLoading, error, refetch } = useCommissionLevels();
  const queryClient = useQueryClient();
  const isOwner = currentAgent?.is_owner ?? false;
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<CommissionLevel | null>(null);

  // Add/Edit form state
  const [formCarrier, setFormCarrier] = useState("");
  const [formProduct, setFormProduct] = useState("");
  const [formPosition, setFormPosition] = useState("");
  const [formRate, setFormRate] = useState("");
  const [formDate, setFormDate] = useState("");
  const [saving, setSaving] = useState(false);

  const openEdit = (row: CommissionLevel) => {
    setEditRow(row);
    setFormCarrier(row.carrier);
    setFormProduct(row.product);
    setFormPosition(row.position);
    setFormRate((row.rate * 100).toFixed(2));
    setFormDate(row.start_date);
    setAddOpen(true);
  };

  const openAdd = () => {
    setEditRow(null);
    setFormCarrier(""); setFormProduct(""); setFormPosition(""); setFormRate(""); setFormDate("");
    setAddOpen(true);
  };

  const handleSave = async () => {
    if (!currentAgent) return;
    setSaving(true);
    try {
      const rateNum = parseFloat(formRate) / 100;
      if (editRow) {
        const { error } = await supabase.from("commission_levels").update({
          carrier: formCarrier, product: formProduct, position: formPosition, rate: rateNum, start_date: formDate,
        }).eq("id", editRow.id);
        if (error) throw error;
        toast.success("Rate updated");
      } else {
        const { error } = await supabase.from("commission_levels").insert({
          tenant_id: currentAgent.tenant_id, carrier: formCarrier, product: formProduct, position: formPosition, rate: rateNum, start_date: formDate,
        });
        if (error) throw error;
        toast.success("Rate added");
      }
      queryClient.invalidateQueries({ queryKey: ["commissionLevels"] });
      setAddOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this rate?")) return;
    const { error } = await supabase.from("commission_levels").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Rate deleted");
    queryClient.invalidateQueries({ queryKey: ["commissionLevels"] });
  };

  const columns: Column<CommissionLevel>[] = [
    { key: "carrier", label: "Carrier" },
    { key: "product", label: "Product" },
    { key: "position", label: "Position" },
    { key: "rate", label: "Rate", render: (r) => formatPercent(r.rate), getValue: (r) => r.rate },
    { key: "start_date", label: "Effective Date", render: (r) => formatDate(r.start_date) },
    ...(isOwner ? [{
      key: "actions" as const,
      label: "",
      sortable: false,
      render: (r: CommissionLevel) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(r)}>Edit</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(r.id)}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    }] : []),
  ];

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Commission Levels</h1>
          {isOwner && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>Import CSV</Button>
              <Button size="sm" onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add Rate</Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <SkeletonTable columns={5} />
        ) : (levels ?? []).length === 0 ? (
          <EmptyState title="No commission rates" description="Add commission rate schedules to calculate agent commissions." action={isOwner ? { label: "Add Rate", onClick: openAdd } : undefined} />
        ) : (
          <DataTable columns={columns} data={levels ?? []} pageSize={25} />
        )}
      </div>

      <CSVImportModal open={importOpen} onOpenChange={setImportOpen} defaultTab="commissions" />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editRow ? "Edit Rate" : "Add Rate"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Carrier</Label><Input value={formCarrier} onChange={(e) => setFormCarrier(e.target.value)} /></div>
            <div><Label>Product</Label><Input value={formProduct} onChange={(e) => setFormProduct(e.target.value)} /></div>
            <div><Label>Position</Label><Input value={formPosition} onChange={(e) => setFormPosition(e.target.value)} /></div>
            <div><Label>Rate (%)</Label><Input value={formRate} onChange={(e) => setFormRate(e.target.value)} placeholder="127.00" /></div>
            <div><Label>Effective Date</Label><Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} /></div>
            <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default CommissionLevels;
