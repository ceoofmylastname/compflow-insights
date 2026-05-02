import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { COMP_GUIDE_LIBRARY } from "@/lib/onboarding/comp-guide-library";
import { toast } from "sonner";

interface Props {
  onNext: () => void;
  onBack: () => void;
}

export function Step3FirstCarrier({ onNext, onBack }: Props) {
  const { data: currentAgent } = useCurrentAgent();
  const [mode, setMode] = useState<"library" | "custom">("library");
  const [selectedGuideId, setSelectedGuideId] = useState<string>(COMP_GUIDE_LIBRARY[0]?.id ?? "");
  const [customName, setCustomName] = useState("");
  const [customShortName, setCustomShortName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!currentAgent?.tenant_id) return;

    let name = "";
    let shortName = "";
    if (mode === "library") {
      const guide = COMP_GUIDE_LIBRARY.find((g) => g.id === selectedGuideId);
      if (!guide) {
        toast.error("Pick a carrier from the library");
        return;
      }
      name = guide.name;
      shortName = guide.shortName;
    } else {
      if (!customName.trim()) {
        toast.error("Enter a carrier name");
        return;
      }
      name = customName.trim();
      shortName = customShortName.trim() || customName.trim();
    }

    setSaving(true);
    try {
      // Skip if a carrier with the same name already exists for this tenant.
      const { data: existing } = await supabase
        .from("carriers")
        .select("id")
        .eq("tenant_id", currentAgent.tenant_id)
        .ilike("name", name)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase
          .from("carriers")
          .insert({
            tenant_id: currentAgent.tenant_id,
            name,
            short_name: shortName,
            status: "active",
          } as any);
        if (error) throw error;
      }
      toast.success(existing ? "Carrier already added" : "Carrier added");
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
        <h2 className="text-xl font-bold text-foreground">Add your first carrier</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick from our curated library or add a custom carrier. You can always add more later.
          Comp grids are filled in on the Carriers and Comp Sheets page.
        </p>
      </div>

      <RadioGroup value={mode} onValueChange={(v) => setMode(v as "library" | "custom")} className="space-y-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <RadioGroupItem value="library" id="mode-library" className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="mode-library" className="text-base font-semibold">
                Pick from the library
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Common public-comp carriers. We pre-fill the carrier name and short name for ingest matching.
              </p>
              {mode === "library" && (
                <div className="mt-3 space-y-2">
                  {COMP_GUIDE_LIBRARY.map((g) => (
                    <label
                      key={g.id}
                      className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                        selectedGuideId === g.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="comp-guide"
                        value={g.id}
                        checked={selectedGuideId === g.id}
                        onChange={() => setSelectedGuideId(g.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{g.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{g.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <RadioGroupItem value="custom" id="mode-custom" className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="mode-custom" className="text-base font-semibold">
                Add a custom carrier
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Use this when your carrier is not on the list.
              </p>
              {mode === "custom" && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Carrier name *</Label>
                    <Input
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="e.g. Liberty Bankers"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Short name (matching key)</Label>
                    <Input
                      value={customShortName}
                      onChange={(e) => setCustomShortName(e.target.value)}
                      placeholder="LibertyBankers"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </RadioGroup>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save and continue"}
        </Button>
      </div>
    </div>
  );
}
