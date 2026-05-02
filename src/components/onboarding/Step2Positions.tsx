import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { DEFAULT_POSITIONS } from "@/lib/onboarding/default-positions";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";

interface Row {
  id: string;
  title: string;
  priority: number;
  /** True if this row already exists in the DB. */
  persisted: boolean;
}

interface Props {
  onNext: () => void;
  onBack: () => void;
}

export function Step2Positions({ onNext, onBack }: Props) {
  const { data: currentAgent } = useCurrentAgent();
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loaded || !currentAgent?.tenant_id) return;
    (async () => {
      const { data } = await supabase
        .from("positions")
        .select("id, title, priority")
        .eq("tenant_id", currentAgent.tenant_id)
        .order("priority", { ascending: true });

      if (data && data.length > 0) {
        setRows(data.map((p) => ({
          id: p.id,
          title: p.title,
          priority: p.priority,
          persisted: true,
        })));
      } else {
        setRows(DEFAULT_POSITIONS.map((p, i) => ({
          id: `seed-${i}`,
          title: p.title,
          priority: p.priority,
          persisted: false,
        })));
      }
      setLoaded(true);
    })();
  }, [currentAgent?.tenant_id, loaded]);

  const updateRow = (id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const moveRow = (id: string, dir: "up" | "down") => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx < 0) return prev;
      const target = dir === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((r, i) => ({ ...r, priority: (i + 1) * 10 }));
    });
  };

  const addRow = () => {
    const nextPriority = rows.length === 0 ? 10 : Math.max(...rows.map((r) => r.priority)) + 10;
    setRows((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, title: "", priority: nextPriority, persisted: false },
    ]);
  };

  const handleSave = async () => {
    if (!currentAgent?.tenant_id) return;
    const filtered = rows.filter((r) => r.title.trim());
    if (filtered.length === 0) {
      toast.error("Add at least one position");
      return;
    }
    setSaving(true);
    try {
      // Insert all non-persisted rows. Existing rows stay as-is.
      const toInsert = filtered
        .filter((r) => !r.persisted)
        .map((r) => ({
          tenant_id: currentAgent.tenant_id,
          title: r.title.trim(),
          priority: r.priority,
        }));
      if (toInsert.length > 0) {
        const { error } = await supabase.from("positions").insert(toInsert as any);
        if (error) throw error;
      }
      // Update priority/title on persisted rows in case the owner reordered.
      const persistedRows = filtered.filter((r) => r.persisted);
      for (const r of persistedRows) {
        await supabase
          .from("positions")
          .update({ title: r.title.trim(), priority: r.priority } as any)
          .eq("id", r.id);
      }
      toast.success("Positions saved");
      onNext();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">Positions blueprint</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Define the ranks of your agency. Lower priority numbers sit higher on the ladder.
          We pre-filled a 9-position template. Rename, reorder, or add your own.
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2 rounded-md border border-border bg-card p-3">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => moveRow(r.id, "up")}
                disabled={i === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label="Move up"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveRow(r.id, "down")}
                disabled={i === rows.length - 1}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label="Move down"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 grid grid-cols-[1fr_80px] gap-2 items-center">
              <Input
                value={r.title}
                onChange={(e) => updateRow(r.id, { title: e.target.value })}
                placeholder="e.g. Manager"
              />
              <Input
                value={String(r.priority)}
                onChange={(e) => updateRow(r.id, { priority: parseInt(e.target.value) || 0 })}
                type="number"
                aria-label="Priority"
              />
            </div>
            <button
              type="button"
              onClick={() => removeRow(r.id)}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remove position"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-2 h-4 w-4" /> Add position
        </Button>
      </div>

      <div className="rounded-md bg-muted/30 border border-border p-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Why priority matters:</span> the comp grid
          calculates upline overrides as the difference between an upline's rate and the rate below
          them. Priority lets the engine compute that spread without hard-coded rank labels.
        </p>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save and continue"}
        </Button>
      </div>
    </div>
  );
}
