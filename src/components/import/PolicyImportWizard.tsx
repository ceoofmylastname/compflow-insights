import { useState, useMemo, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  AlertTriangle,
  Download,
  Plus,
  Trash2,
  Save,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseCSV } from "@/lib/csv-utils";
import { parseXLSX } from "@/lib/xlsx-utils";
import {
  detectCarrierFromHeaders,
  applyColumnMapping,
  autoMapColumns,
  resolveAgent,
  validateImportRow,
  SYSTEM_FIELDS,
  type CarrierProfile,
  type CustomField,
  type ImportRow,
} from "@/lib/carrier-import-engine";
import { cleanCurrency, normalizeStatus, downloadCSV, rowsToCSV } from "@/lib/csv-utils";
import { calculateAndSavePayouts } from "@/lib/commission-engine";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useAgents } from "@/hooks/useAgents";
import { useCarrierProfiles, useCreateCarrierProfile } from "@/hooks/useCarrierProfiles";
import { useCarrierOptions } from "@/hooks/useCarrierOptions";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCanImport } from "@/hooks/useCanImport";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PolicyImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AgentResolutionRow {
  writingAgentId: string;
  carrier: string;
  resolvedAgentId: string | null;
  method: string | null;
  manualAgentId: string;
  saveAsAlias: boolean;
}

interface ImportResult {
  imported: number;
  payoutsCalculated: number;
  webhooksFired: number;
  skipped: number;
  aliasesSaved: number;
}

const STEPS = ["Upload", "Map Columns", "Resolve Agents", "Validate", "Import"] as const;

const FIELD_LABELS: Record<string, string> = {
  policy_number: "Policy Number",
  application_date: "Application Date",
  writing_agent_id: "Writing Agent ID",
  client_name: "Client Name",
  client_phone: "Client Phone",
  client_dob: "Client DOB",
  carrier: "Carrier",
  product: "Product",
  annual_premium: "Annual Premium",
  status: "Status",
  contract_type: "Contract Type",
  lead_source: "Lead Source",
  effective_date: "Effective Date",
  notes: "Notes",
  refs_collected: "Refs Collected",
  refs_sold: "Refs Sold",
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function PolicyImportWizard({ open, onOpenChange }: PolicyImportWizardProps) {
  const { canImport } = useCanImport();
  const { data: currentAgent } = useCurrentAgent();
  const { data: agents } = useAgents();
  const { data: carrierProfiles } = useCarrierProfiles();
  const createProfile = useCreateCarrierProfile();
  const { carriers: carrierOptions } = useCarrierOptions();
  const queryClient = useQueryClient();

  /* ---------- wizard state ---------- */
  const [step, setStep] = useState(0);

  /* Step 1: Upload */
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [detectedProfile, setDetectedProfile] = useState<CarrierProfile | null>(null);
  const [carrierName, setCarrierName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Step 2: Column Mapping */
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [newCfLabel, setNewCfLabel] = useState("");
  const [newCfType, setNewCfType] = useState<"text" | "number" | "date">("text");
  const [newCfColumn, setNewCfColumn] = useState("");

  /* Step 3: Agent Resolution */
  const [agentResolutions, setAgentResolutions] = useState<AgentResolutionRow[]>([]);
  const [resolving, setResolving] = useState(false);

  /* Step 4: Validation */
  const [importRows, setImportRows] = useState<ImportRow[]>([]);

  /* Step 4b: Import mode */
  const [importMode, setImportMode] = useState<"replace" | "additive">("replace");

  /* Step 5: Import */
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  /* ---------- helpers ---------- */
  const reset = useCallback(() => {
    setStep(0);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setDetectedProfile(null);
    setCarrierName("");
    setColumnMappings({});
    setCustomFields([]);
    setNewCfLabel("");
    setNewCfType("text");
    setNewCfColumn("");
    setAgentResolutions([]);
    setResolving(false);
    setImportRows([]);
    setImportMode("replace");
    setImporting(false);
    setImportProgress(0);
    setImportResult(null);
  }, []);

  const validRows = useMemo(
    () => importRows.filter((r) => r.errors.length === 0),
    [importRows]
  );
  const warningRows = useMemo(
    () => importRows.filter((r) => r.errors.length === 0 && r.warnings.length > 0),
    [importRows]
  );
  const errorRows = useMemo(
    () => importRows.filter((r) => r.errors.length > 0),
    [importRows]
  );

  /* ---------- Step 1: File handling ---------- */
  const handleFileSelect = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let parsed: { headers: string[]; rows: string[][] };

      if (ext === "xlsx" || ext === "xls") {
        const buffer = await file.arrayBuffer();
        parsed = parseXLSX(buffer);
      } else {
        const text = await file.text();
        parsed = parseCSV(text);
      }

      if (parsed.headers.length === 0) {
        toast.error("File appears to be empty");
        return;
      }

      setFileName(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);

      // Auto-detect carrier
      const profiles = carrierProfiles ?? [];
      const detected = detectCarrierFromHeaders(parsed.headers, profiles);
      if (detected) {
        setDetectedProfile(detected);
        setCarrierName(detected.carrier_name);
        setColumnMappings(detected.column_mappings as Record<string, string>);
        setCustomFields((detected.custom_fields ?? []) as CustomField[]);
      } else {
        setDetectedProfile(null);
        setColumnMappings(autoMapColumns(parsed.headers));
        setCustomFields([]);
      }
    },
    [carrierProfiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  /* ---------- Step 2: Mapping helpers ---------- */
  const updateMapping = useCallback((systemField: string, csvHeader: string) => {
    setColumnMappings((prev) => {
      const next = { ...prev };
      if (csvHeader === "__none__") {
        delete next[systemField];
      } else {
        next[systemField] = csvHeader;
      }
      return next;
    });
  }, []);

  const addCustomField = useCallback(() => {
    if (!newCfLabel.trim() || !newCfColumn) return;
    setCustomFields((prev) => [
      ...prev,
      { label: newCfLabel.trim(), type: newCfType, csvColumn: newCfColumn },
    ]);
    setNewCfLabel("");
    setNewCfType("text");
    setNewCfColumn("");
  }, [newCfLabel, newCfType, newCfColumn]);

  const removeCustomField = useCallback((index: number) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const loadProfile = useCallback(
    (profileId: string) => {
      const profile = (carrierProfiles ?? []).find((p) => p.id === profileId);
      if (!profile) return;
      setCarrierName(profile.carrier_name);
      setColumnMappings(profile.column_mappings as Record<string, string>);
      setCustomFields((profile.custom_fields ?? []) as CustomField[]);
    },
    [carrierProfiles]
  );

  /* ---------- Step 2 -> 3: Build agent resolution ---------- */
  const proceedToAgentResolution = useCallback(async () => {
    if (!currentAgent) return;
    setResolving(true);

    // Build all mapped rows first to extract unique writing_agent_ids
    const uniqueAgents = new Map<string, string>(); // writingAgentId -> carrier
    for (const row of rows) {
      const { mapped } = applyColumnMapping(headers, row, columnMappings, customFields);
      const wai = mapped.writing_agent_id?.trim();
      const car = mapped.carrier?.trim() || carrierName;
      if (wai && !uniqueAgents.has(wai)) {
        uniqueAgents.set(wai, car);
      }
    }

    // Resolve each unique agent
    const resolutions: AgentResolutionRow[] = [];
    for (const [writingAgentId, carrier] of uniqueAgents) {
      const result = await resolveAgent(
        writingAgentId,
        carrier,
        currentAgent.tenant_id,
        supabase
      );
      resolutions.push({
        writingAgentId,
        carrier,
        resolvedAgentId: result.agentId,
        method: result.method,
        manualAgentId: "",
        saveAsAlias: false,
      });
    }

    setAgentResolutions(resolutions);
    setResolving(false);
    setStep(2);
  }, [currentAgent, rows, headers, columnMappings, customFields, carrierName]);

  /* ---------- Step 3 -> 4: Validate ---------- */
  const proceedToValidation = useCallback(() => {
    // Build resolution lookup
    const resolutionMap = new Map<string, { agentId: string | null; method: string | null }>();
    for (const r of agentResolutions) {
      const agentId = r.manualAgentId || r.resolvedAgentId;
      const method = r.manualAgentId ? "manual" : r.method;
      resolutionMap.set(r.writingAgentId, { agentId, method });
    }

    const built: ImportRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const { mapped, customFieldValues } = applyColumnMapping(
        headers,
        rows[i],
        columnMappings,
        customFields
      );

      // Apply carrier name if not in mapping
      if (!mapped.carrier?.trim() && carrierName) {
        mapped.carrier = carrierName;
      }

      const { errors, warnings } = validateImportRow(mapped, i);

      // Resolve agent from our pre-built map
      const wai = mapped.writing_agent_id?.trim();
      let resolvedAgentId: string | null = null;
      let resolutionMethod: string | null = null;
      if (wai && resolutionMap.has(wai)) {
        const res = resolutionMap.get(wai)!;
        resolvedAgentId = res.agentId;
        resolutionMethod = res.method;
      }

      built.push({
        rowIndex: i,
        mapped,
        customFieldValues,
        resolvedAgentId,
        resolutionMethod,
        errors,
        warnings,
      });
    }

    setImportRows(built);
    setStep(3);
  }, [rows, headers, columnMappings, customFields, carrierName, agentResolutions]);

  /* ---------- Step 4: Download skip report ---------- */
  const downloadSkipReport = useCallback(() => {
    const skipHeaders = ["Row", "Policy Number", "Client Name", "Errors"];
    const skipRows = errorRows.map((r) => [
      String(r.rowIndex + 2),
      r.mapped.policy_number || "",
      r.mapped.client_name || "",
      r.errors.join("; "),
    ]);
    downloadCSV("import-skip-report.csv", rowsToCSV(skipHeaders, skipRows));
  }, [errorRows]);

  /* ---------- Step 5: Execute import ---------- */
  const executeImport = useCallback(async () => {
    if (!currentAgent) return;
    setImporting(true);
    setImportProgress(0);

    const result: ImportResult = {
      imported: 0,
      payoutsCalculated: 0,
      webhooksFired: 0,
      skipped: 0,
      aliasesSaved: 0,
    };

    const toImport = validRows;
    const total = toImport.length;

    for (let i = 0; i < toImport.length; i++) {
      const row = toImport[i];
      const m = row.mapped;

      try {
        const resolvedAgentId = row.resolvedAgentId || currentAgent.id;
        const status = m.status ? normalizeStatus(m.status) : "Submitted";
        const rawPremium = m.annual_premium ? cleanCurrency(m.annual_premium) : 0;
        const rawRefsCollected = m.refs_collected ? parseInt(m.refs_collected, 10) : 0;
        const rawRefsSold = m.refs_sold ? parseInt(m.refs_sold, 10) : 0;

        let premiumToUpsert = rawPremium;
        let refsCollectedToUpsert = rawRefsCollected;
        let refsSoldToUpsert = rawRefsSold;

        if (importMode === "additive" && m.policy_number) {
          const { data: existing } = await supabase
            .from("policies")
            .select("annual_premium, refs_collected, refs_sold")
            .eq("policy_number", m.policy_number.trim())
            .eq("tenant_id", currentAgent.tenant_id)
            .maybeSingle();
          if (existing) {
            premiumToUpsert = (existing.annual_premium || 0) + rawPremium;
            refsCollectedToUpsert = (existing.refs_collected || 0) + rawRefsCollected;
            refsSoldToUpsert = (existing.refs_sold || 0) + rawRefsSold;
          }
        }

        const { data: policy, error } = await supabase
          .from("policies")
          .upsert(
            {
              tenant_id: currentAgent.tenant_id,
              policy_number: m.policy_number?.trim() || null,
              application_date: m.application_date || null,
              client_name: m.client_name?.trim() || null,
              client_phone: m.client_phone?.trim() || null,
              client_dob: m.client_dob || null,
              carrier: m.carrier?.trim() || null,
              product: m.product?.trim() || null,
              annual_premium: premiumToUpsert,
              status,
              contract_type: m.contract_type?.trim() || null,
              lead_source: m.lead_source?.trim() || null,
              effective_date: m.effective_date || null,
              notes: m.notes?.trim() || null,
              refs_collected: refsCollectedToUpsert,
              refs_sold: refsSoldToUpsert,
              resolved_agent_id: resolvedAgentId,
              custom_fields: Object.keys(row.customFieldValues).length > 0
                ? row.customFieldValues
                : {},
            } as any,
            { onConflict: "policy_number,tenant_id", ignoreDuplicates: false }
          )
          .select()
          .single();

        if (error) {
          result.skipped++;
          continue;
        }

        result.imported++;

        // Calculate payouts
        if (policy) {
          try {
            await calculateAndSavePayouts(policy.id, supabase);
            result.payoutsCalculated++;
          } catch {}

          // Fire webhooks if Active
          if (status === "Active") {
            const { data: activeWebhooks } = await supabase
              .from("webhook_configs")
              .select("*")
              .eq("tenant_id", currentAgent.tenant_id)
              .eq("is_active", true)
              .eq("event_type", "deal.posted" as any);

            const webhooks = (activeWebhooks ?? []) as Array<{ webhook_url: string }>;
            const agent = agents?.find((a) => a.id === resolvedAgentId);

            for (const config of webhooks) {
              try {
                await supabase.functions.invoke("fire-webhook", {
                  body: {
                    webhook_url: config.webhook_url,
                    payload: {
                      event: "deal.posted",
                      policy_number: m.policy_number?.trim(),
                      client_name: m.client_name?.trim(),
                      carrier: m.carrier?.trim(),
                      product: m.product?.trim(),
                      annual_premium: premiumToUpsert,
                      agent_email: agent?.email || "",
                      application_date: m.application_date,
                      status,
                    },
                  },
                });
                result.webhooksFired++;
              } catch {}
            }
          }
        }
      } catch {
        result.skipped++;
      }

      setImportProgress(Math.round(((i + 1) / total) * 100));
    }

    // Save aliases for manual resolutions
    const aliasResolutions = agentResolutions.filter(
      (r) => r.saveAsAlias && r.manualAgentId
    );
    for (const r of aliasResolutions) {
      try {
        await supabase.from("carrier_agent_aliases").upsert(
          {
            tenant_id: currentAgent.tenant_id,
            carrier: r.carrier,
            writing_agent_id: r.writingAgentId,
            agent_id: r.manualAgentId,
          } as any,
          { onConflict: "tenant_id,carrier,writing_agent_id" as any, ignoreDuplicates: false }
        );
        result.aliasesSaved++;
      } catch {}
    }

    queryClient.invalidateQueries({ queryKey: ["policies"] });
    queryClient.invalidateQueries({ queryKey: ["commissionPayouts"] });

    setImportResult(result);
    setImporting(false);
    setStep(4);
  }, [currentAgent, validRows, agentResolutions, agents, queryClient, importMode]);

  /* ---------- Save carrier profile ---------- */
  const handleSaveProfile = useCallback(() => {
    if (!carrierName.trim()) {
      toast.error("Enter a carrier name to save the profile");
      return;
    }
    createProfile.mutate({
      carrier_name: carrierName.trim(),
      column_mappings: columnMappings,
      custom_fields: customFields,
      header_fingerprint: headers,
    });
  }, [carrierName, columnMappings, customFields, headers, createProfile]);

  /* ---------- Download import report ---------- */
  const downloadImportReport = useCallback(() => {
    const reportHeaders = ["Row", "Policy Number", "Client Name", "Status", "Errors/Warnings"];
    const reportRows = importRows.map((r) => [
      String(r.rowIndex + 2),
      r.mapped.policy_number || "",
      r.mapped.client_name || "",
      r.errors.length > 0 ? "Skipped" : "Imported",
      [...r.errors, ...r.warnings].join("; ") || "OK",
    ]);
    downloadCSV("import-report.csv", rowsToCSV(reportHeaders, reportRows));
  }, [importRows]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Policy Import Wizard</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-1">
              {i > 0 && <div className="w-6 h-px bg-border" />}
              <div
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                  i === step
                    ? "bg-primary text-primary-foreground"
                    : i < step
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
                <span className="hidden sm:inline">{label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ============ STEP 1: Upload ============ */}
        {step === 0 && (
          <div className="space-y-4">
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                fileName
                  ? "border-primary/40 bg-primary/5"
                  : "border-border hover:border-primary/30 hover:bg-muted/30"
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileInput}
              />
              {fileName ? (
                <div className="space-y-2">
                  <FileSpreadsheet className="h-10 w-10 mx-auto text-primary" />
                  <p className="text-sm font-medium text-foreground">{fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {rows.length} rows, {headers.length} columns
                  </p>
                  {detectedProfile && (
                    <Badge variant="secondary" className="mt-1">
                      Auto-detected: {detectedProfile.carrier_name}
                    </Badge>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drop a <strong>.csv</strong>, <strong>.xlsx</strong>, or{" "}
                    <strong>.xls</strong> file here, or click to browse
                  </p>
                </div>
              )}
            </div>

            {fileName && (
              <div className="space-y-2">
                <div>
                  <Label>Carrier Name</Label>
                  <Input
                    value={carrierName}
                    onChange={(e) => setCarrierName(e.target.value)}
                    placeholder="e.g. Mutual of Omaha"
                    list="import-carrier-options"
                  />
                  <datalist id="import-carrier-options">
                    {carrierOptions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                disabled={!fileName || rows.length === 0}
                onClick={() => setStep(1)}
              >
                Next <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ============ STEP 2: Column Mapping ============ */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Profile selector */}
            {(carrierProfiles ?? []).length > 0 && (
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0">Load Profile:</Label>
                <Select onValueChange={loadProfile}>
                  <SelectTrigger className="w-56 h-8 text-xs">
                    <SelectValue placeholder="Select saved profile..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(carrierProfiles ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.carrier_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Mapping grid */}
            <div className="rounded-md border border-border max-h-[45vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">System Field</TableHead>
                    <TableHead>CSV Column</TableHead>
                    <TableHead className="w-48">Sample Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SYSTEM_FIELDS.map((field) => (
                    <TableRow key={field}>
                      <TableCell className="text-xs font-medium">
                        {FIELD_LABELS[field] || field}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={columnMappings[field] || "__none__"}
                          onValueChange={(v) => updateMapping(field, v)}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">-- Not mapped --</SelectItem>
                            {headers.map((h) => (
                              <SelectItem key={h} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {columnMappings[field] && rows[0]
                          ? rows[0][headers.indexOf(columnMappings[field])] || "--"
                          : "--"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Custom fields */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Custom Fields</p>
              {customFields.length > 0 && (
                <div className="space-y-1">
                  {customFields.map((cf, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Badge variant="outline">{cf.label}</Badge>
                      <span className="text-muted-foreground">{cf.type}</span>
                      <span className="text-muted-foreground">&rarr; {cf.csvColumn}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => removeCustomField(i)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <div className="w-32">
                  <Label className="text-[10px]">Label</Label>
                  <Input
                    value={newCfLabel}
                    onChange={(e) => setNewCfLabel(e.target.value)}
                    className="h-7 text-xs"
                    placeholder="Field name"
                  />
                </div>
                <div className="w-24">
                  <Label className="text-[10px]">Type</Label>
                  <Select
                    value={newCfType}
                    onValueChange={(v) => setNewCfType(v as "text" | "number" | "date")}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-36">
                  <Label className="text-[10px]">CSV Column</Label>
                  <Select value={newCfColumn} onValueChange={setNewCfColumn}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={addCustomField}
                  disabled={!newCfLabel.trim() || !newCfColumn}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(0)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button onClick={proceedToAgentResolution} disabled={resolving}>
                {resolving ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Resolving...
                  </>
                ) : (
                  <>
                    Next <ArrowRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ============ STEP 3: Agent Resolution ============ */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {agentResolutions.filter((r) => r.resolvedAgentId || r.manualAgentId).length} of{" "}
                {agentResolutions.length} agent IDs resolved
              </p>
            </div>

            {agentResolutions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No writing agent IDs found in the data. Policies will be assigned to you.
              </p>
            ) : (
              <div className="rounded-md border border-border max-h-[50vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Writing Agent ID</TableHead>
                      <TableHead>Carrier</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Resolved Agent</TableHead>
                      <TableHead className="w-48">Manual Override</TableHead>
                      <TableHead className="w-20">Save Alias</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentResolutions.map((r, i) => {
                      const resolved = r.resolvedAgentId || r.manualAgentId;
                      const resolvedAgent = agents?.find((a) => a.id === resolved);
                      return (
                        <TableRow key={r.writingAgentId}>
                          <TableCell className="text-xs font-mono">
                            {r.writingAgentId}
                          </TableCell>
                          <TableCell className="text-xs">{r.carrier}</TableCell>
                          <TableCell>
                            {r.method ? (
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-[10px]",
                                  r.resolvedAgentId ? "bg-green-100 text-green-800" : ""
                                )}
                              >
                                {r.method}
                              </Badge>
                            ) : r.manualAgentId ? (
                              <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-800">
                                manual
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px]">
                                unresolved
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {resolvedAgent
                              ? `${resolvedAgent.first_name} ${resolvedAgent.last_name}`
                              : "--"}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={r.manualAgentId || "__none__"}
                              onValueChange={(v) => {
                                setAgentResolutions((prev) =>
                                  prev.map((item, idx) =>
                                    idx === i
                                      ? { ...item, manualAgentId: v === "__none__" ? "" : v }
                                      : item
                                  )
                                );
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Override..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">-- No override --</SelectItem>
                                {(agents ?? []).map((a) => (
                                  <SelectItem key={a.id} value={a.id}>
                                    {a.first_name} {a.last_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={r.saveAsAlias}
                              disabled={!r.manualAgentId}
                              onCheckedChange={(v) => {
                                setAgentResolutions((prev) =>
                                  prev.map((item, idx) =>
                                    idx === i
                                      ? { ...item, saveAsAlias: !!v }
                                      : item
                                  )
                                );
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button onClick={proceedToValidation}>
                Next <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ============ STEP 4: Validation Preview ============ */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span>{validRows.length - warningRows.length} ready</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                <span>{warningRows.length} warnings</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span>{errorRows.length} will be skipped</span>
              </div>
              {errorRows.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto text-xs"
                  onClick={downloadSkipReport}
                >
                  <Download className="h-3 w-3 mr-1" /> Skip Report
                </Button>
              )}
            </div>

            {/* Row preview */}
            <div className="rounded-md border border-border max-h-[45vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Row</TableHead>
                    <TableHead className="w-12">Status</TableHead>
                    <TableHead>Policy #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>Premium</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importRows.slice(0, 100).map((r) => {
                    const hasErrors = r.errors.length > 0;
                    const hasWarnings = r.warnings.length > 0;
                    return (
                      <TableRow
                        key={r.rowIndex}
                        className={cn(
                          hasErrors
                            ? "bg-red-50 dark:bg-red-950/20"
                            : hasWarnings
                            ? "bg-yellow-50 dark:bg-yellow-950/20"
                            : ""
                        )}
                      >
                        <TableCell className="text-xs">{r.rowIndex + 2}</TableCell>
                        <TableCell>
                          {hasErrors ? (
                            <X className="h-4 w-4 text-red-500" />
                          ) : hasWarnings ? (
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          ) : (
                            <Check className="h-4 w-4 text-green-500" />
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{r.mapped.policy_number || "--"}</TableCell>
                        <TableCell className="text-xs">{r.mapped.client_name || "--"}</TableCell>
                        <TableCell className="text-xs">{r.mapped.carrier || "--"}</TableCell>
                        <TableCell className="text-xs">{r.mapped.annual_premium || "--"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {[...r.errors, ...r.warnings].join("; ") || "OK"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {importRows.length > 100 && (
              <p className="text-xs text-muted-foreground">
                Showing first 100 of {importRows.length} rows
              </p>
            )}

            {/* Import mode toggle */}
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
              <div className="flex-1">
                <p className="text-sm font-medium">Import Mode</p>
                <p className="text-xs text-muted-foreground">
                  Replace: overwrites existing policy data. Additive: adds premium to existing totals (use for weekly carrier summaries).
                </p>
              </div>
              <Select value={importMode} onValueChange={(v) => setImportMode(v as "replace" | "additive")}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="replace">Replace</SelectItem>
                  <SelectItem value="additive">Additive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button onClick={executeImport} disabled={validRows.length === 0}>
                Confirm Import ({validRows.length} rows)
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ============ STEP 5: Import + Results ============ */}
        {step === 4 && (
          <div className="space-y-4">
            {importing ? (
              <div className="space-y-3 py-8">
                <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                <p className="text-sm text-center text-muted-foreground">
                  Importing policies...
                </p>
                <Progress value={importProgress} className="w-full max-w-md mx-auto" />
                <p className="text-xs text-center text-muted-foreground">
                  {importProgress}%
                </p>
              </div>
            ) : importResult ? (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <Check className="h-10 w-10 mx-auto text-green-500 mb-2" />
                  <p className="text-lg font-semibold text-foreground">Import Complete</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className="text-2xl font-bold text-foreground">
                      {importResult.imported}
                    </p>
                    <p className="text-xs text-muted-foreground">Imported</p>
                  </div>
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className="text-2xl font-bold text-foreground">
                      {importResult.payoutsCalculated}
                    </p>
                    <p className="text-xs text-muted-foreground">Payouts</p>
                  </div>
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className="text-2xl font-bold text-foreground">
                      {importResult.webhooksFired}
                    </p>
                    <p className="text-xs text-muted-foreground">Webhooks</p>
                  </div>
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className="text-2xl font-bold text-foreground">
                      {importResult.skipped}
                    </p>
                    <p className="text-xs text-muted-foreground">Skipped</p>
                  </div>
                </div>

                {importResult.aliasesSaved > 0 && (
                  <p className="text-xs text-muted-foreground text-center">
                    {importResult.aliasesSaved} carrier alias(es) saved for future imports
                  </p>
                )}

                <div className="flex items-center justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleSaveProfile}>
                    <Save className="h-3.5 w-3.5 mr-1" /> Save Carrier Profile
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadImportReport}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Download Report
                  </Button>
                </div>

                <div className="flex justify-center">
                  <Button
                    onClick={() => {
                      reset();
                      onOpenChange(false);
                    }}
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
