import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { toast } from "sonner";

const TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
];

interface Props {
  onNext: () => void;
}

export function Step1AgencyProfile({ onNext }: Props) {
  const { data: currentAgent } = useCurrentAgent();
  const [agencyName, setAgencyName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [timeZone, setTimeZone] = useState("America/New_York");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [defaultAnnualGoal, setDefaultAnnualGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded || !currentAgent?.tenant_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tenants")
        .select("agency_name, logo_url, time_zone, default_currency, default_annual_goal")
        .eq("id", currentAgent.tenant_id)
        .maybeSingle();
      if (cancelled) return;
      const t = data as any;
      if (t) {
        setAgencyName(t.agency_name ?? "");
        setLogoUrl(t.logo_url ?? "");
        setTimeZone(t.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/New_York");
        setDefaultCurrency(t.default_currency ?? "USD");
        setDefaultAnnualGoal(t.default_annual_goal != null ? String(t.default_annual_goal) : "");
      } else {
        // Detect browser timezone as a sane default.
        try {
          setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
        } catch {/* keep fallback */}
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [currentAgent?.tenant_id, loaded]);

  const handleSave = async () => {
    if (!currentAgent?.tenant_id) return;
    if (!agencyName.trim()) {
      toast.error("Agency name is required");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tenants")
        .update({
          agency_name: agencyName.trim(),
          logo_url: logoUrl.trim() || null,
          time_zone: timeZone,
          default_currency: defaultCurrency,
          default_annual_goal: defaultAnnualGoal ? parseFloat(defaultAnnualGoal) : null,
        } as any)
        .eq("id", currentAgent.tenant_id);
      if (error) throw error;
      toast.success("Agency profile saved");
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
        <h2 className="text-xl font-bold text-foreground">Agency profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The basics of your agency. You can update any of these later in Settings.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Agency name *</Label>
          <Input
            value={agencyName}
            onChange={(e) => setAgencyName(e.target.value)}
            placeholder="e.g. Apex Insurance Group"
          />
        </div>

        <div>
          <Label>Logo URL</Label>
          <Input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://your-host.com/logo.png"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Paste a public image URL. We display this in the sidebar and on the login screen.
          </p>
          {logoUrl && (
            <div className="mt-2 flex items-center gap-3 rounded-md border border-border bg-muted/30 p-2">
              <img
                src={logoUrl}
                alt="Logo preview"
                className="h-8 max-w-32 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <span className="text-xs text-muted-foreground">Preview</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Time zone</Label>
            <Select value={timeZone} onValueChange={setTimeZone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIME_ZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Default currency</Label>
            <Select value={defaultCurrency} onValueChange={setDefaultCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="CAD">CAD ($)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Default agent annual goal</Label>
          <Input
            value={defaultAnnualGoal}
            onChange={(e) => setDefaultAnnualGoal(e.target.value)}
            type="number"
            placeholder="100000"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Pre-filled when you invite a new agent. Override per-agent on their profile.
          </p>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving || !agencyName.trim()}>
          {saving ? "Saving..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}
