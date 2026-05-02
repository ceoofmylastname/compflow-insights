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
  UNMAPPED_STATUS_WARNING_PREFIX,
  SYSTEM_FIELDS,
  type CarrierProfile,
  type CustomField,
  type ImportRow,
} from "@/lib/carrier-import-engine";
import {
  buildStatusMap,
  resolveStatus,
  normalizeKey as normalizeStatusKey,
  CANONICAL_STATUSES,
  CANONICAL_STATUS_HINTS,
  type CanonicalStatus,
} from "@/lib/carrier-status-mapping";
import { cleanCurrency, downloadCSV, rowsToCSV } from "@/lib/csv-utils";
import { calculateAndSavePayouts } from "@/lib/commission-engine";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useAgents } from "@/hooks/useAgents";
import { useCarrierProfiles, useCreateCarrierProfile } from "@/hooks/useCarrierProfiles";
import { useCarrierOptions } from "@/hooks/useCarrierOptions";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCanImport } from "@/hooks/useCanImport";
import { computeDownlineAgentIds } from "@/lib/downline";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PolicyImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Optional callback fired after the import loop finishes. Lets parent
   * surfaces (e.g. Book of Business) react with toasts, query
   * invalidation, or filter switches based on the result.
   */
  onImportComplete?: (result: ImportResult) => void;
}

interface AgentResolutionRow {
  writingAgentId: string;
  agentEmail: string | null;
  carrier: string;
  resolvedAgentId: string | null;
  /** Authoritative name from the JOIN done inside resolveAgent. */
  resolvedAgentName: string | null;
  method: string | null;
  manualAgentId: string;
  saveAsAlias: boolean;
  /**
   * How many CSV rows in this upload share this resolution key
   * (writing_agent_id or, for email-only rows, the email). Surfaced
   * in the Resolve Agents step so the owner sees the blast radius:
   * "3 policies" / "4 policies (will be unassigned)" instead of
   * "1 writing number" with no policy-count context.
   */
  policiesCount: number;
  /** When email and writing-number resolution disagreed. */
  conflict?: { emailAgentId: string; writingNumberAgentId: string };
  /**
   * Set when the importer is a manager (not an owner) and the resolved
   * agent is NOT in their downline tree. Rows with outOfScope are
   * skipped at import time unless the manager picks an in-scope manual
   * override.
   */
  outOfScope?: boolean;
}

export interface ImportResult {
  imported: number;
  payoutsCalculated: number;
  webhooksFired: number;
  skipped: number;
  aliasesSaved: number;
  /** Subset of `imported` that was written with needs_review = true. */
  flaggedForReview: number;
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

export function PolicyImportWizard({ open, onOpenChange, onImportComplete }: PolicyImportWizardProps) {
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
  const [autoCustomFields, setAutoCustomFields] = useState<{ field: CustomField; checked: boolean }[]>([]);
  const [newCfLabel, setNewCfLabel] = useState("");
  const [newCfType, setNewCfType] = useState<"text" | "number" | "date">("text");
  const [newCfColumn, setNewCfColumn] = useState("");

  /* Step 3: Agent Resolution */
  const [agentResolutions, setAgentResolutions] = useState<AgentResolutionRow[]>([]);
  const [resolving, setResolving] = useState(false);

  /* Step 4: Validation */
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  /**
   * In-session inline-picker overrides keyed by normalizeStatusKey(rawValue).
   * Layered on top of the matched carrier profile's status_value_map when
   * computing the effective status map for this import.
   */
  const [statusOverrides, setStatusOverrides] = useState<Record<string, CanonicalStatus>>({});
  /**
   * Set of normalizeStatusKey(rawValue) the owner has chosen to skip rather
   * than map. Rows whose status falls into this set move from the warnings
   * bucket into the "will be skipped" bucket and are not imported.
   */
  const [skippedStatuses, setSkippedStatuses] = useState<Set<string>>(new Set());
  /** Whether the inline picker should write the mapping back to the carrier profile. */
  const [pickerSaveDefault, setPickerSaveDefault] = useState(true);

  /* Step 4b: Import mode */
  const [importMode, setImportMode] = useState<"replace" | "additive">("replace");

  /* Post-import "new writing numbers detected" panel state. Tracks the
     batch insert of agent_contracts rows for writing numbers that were
     resolved via email fallback (i.e. not yet in agent_contracts for
     that carrier). 'idle' = panel visible, 'saving' = inserting,
     'done' = panel hidden because user chose Add or Skip. */
  const [newContractsState, setNewContractsState] = useState<"idle" | "saving" | "done">("idle");

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
    setAutoCustomFields([]);
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
    setNewContractsState("idle");
    setOrphanAgentPicks({});
  }, []);

  /**
   * Effective per-import status map. Layers (last write wins):
   *   1. Platform defaults (seeds/carrier-status-mappings.json)
   *   2. Per-carrier overrides from carrier_profiles.status_value_map
   *   3. In-session overrides from the inline picker
   * Computed once per render and reused for both validation recompute
   * and the actual import write.
   */
  const effectiveStatusMap = useMemo(() => {
    const profileMap = (detectedProfile?.status_value_map ?? null) as Record<string, string> | null;
    return buildStatusMap(profileMap, statusOverrides);
  }, [detectedProfile?.status_value_map, statusOverrides]);

  /**
   * Re-validate status on the fly so picker resolutions update warning
   * counts in real time without rebuilding the whole import (which would
   * re-run agent resolution and Supabase queries).
   */
  const effectiveImportRows = useMemo<ImportRow[]>(() => {
    return importRows.map((r) => {
      const rawStatus = r.mapped.status?.trim() ?? "";
      // Strip any prior unmapped-status warning; we recompute below.
      const filteredWarnings = r.warnings.filter((w) => !w.startsWith(UNMAPPED_STATUS_WARNING_PREFIX));
      const errors = [...r.errors];
      const warnings = [...filteredWarnings];

      if (rawStatus) {
        const key = normalizeStatusKey(rawStatus);
        if (skippedStatuses.has(key)) {
          errors.push(`Skipped: status "${rawStatus}" is unmapped`);
        } else {
          const canonical = resolveStatus(rawStatus, effectiveStatusMap);
          if (!canonical) {
            warnings.push(`${UNMAPPED_STATUS_WARNING_PREFIX} "${rawStatus}"`);
          }
        }
      }

      return { ...r, errors, warnings };
    });
  }, [importRows, effectiveStatusMap, skippedStatuses]);

  const validRows = useMemo(
    () => effectiveImportRows.filter((r) => r.errors.length === 0),
    [effectiveImportRows]
  );
  const warningRows = useMemo(
    () => effectiveImportRows.filter((r) => r.errors.length === 0 && r.warnings.length > 0),
    [effectiveImportRows]
  );
  const errorRows = useMemo(
    () => effectiveImportRows.filter((r) => r.errors.length > 0),
    [effectiveImportRows]
  );

  /**
   * Unique unmapped status raw values across all rows. Drives the inline
   * picker UI in step 3. Each entry is the raw value as it appears in
   * the CSV (preserving capitalization for display); the lookup key is
   * normalizeStatusKey(rawValue).
   */
  const unmappedStatusValues = useMemo<string[]>(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of effectiveImportRows) {
      const rawStatus = r.mapped.status?.trim();
      if (!rawStatus) continue;
      const key = normalizeStatusKey(rawStatus);
      if (skippedStatuses.has(key)) continue;
      if (resolveStatus(rawStatus, effectiveStatusMap)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(rawStatus);
    }
    return out;
  }, [effectiveImportRows, effectiveStatusMap, skippedStatuses]);

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
      
      let finalMappings: Record<string, string> = {};
      let existCfs: CustomField[] = [];
      
      if (detected) {
        setDetectedProfile(detected);
        setCarrierName(detected.carrier_name);
        finalMappings = detected.column_mappings as Record<string, string>;
        existCfs = (detected.custom_fields ?? []) as CustomField[];
        setColumnMappings(finalMappings);
        setCustomFields(existCfs);
      } else {
        setDetectedProfile(null);
        finalMappings = autoMapColumns(parsed.headers);
        const exactCarrierCol = parsed.headers.find(h => {
          const lower = h.trim().toLowerCase();
          return lower === "carrier" || lower === "carrier_name";
        });
        if (exactCarrierCol && !finalMappings["carrier"]) {
          finalMappings["carrier"] = exactCarrierCol;
        }
        setColumnMappings(finalMappings);
        setCustomFields([]);
      }
      
      // Auto-detect custom fields
      const usedCsvCols = new Set(Object.values(finalMappings));
      existCfs.forEach(cf => usedCsvCols.add(cf.csvColumn));

      const newAutoFields = parsed.headers
         .filter(h => h.trim() && !usedCsvCols.has(h))
         .map(h => ({ field: { label: h.trim(), type: "text" as const, csvColumn: h.trim() }, checked: true }));
      setAutoCustomFields(newAutoFields);
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

    const activeCustomFields = [
      ...customFields,
      ...autoCustomFields.filter((f) => f.checked).map((f) => f.field),
    ];

    // Pre-fetch carrier registry for name normalization
    const { data: registeredCarriers } = await supabase
      .from("carriers")
      .select("name")
      .eq("tenant_id", currentAgent.tenant_id);

    const carrierNameMap = new Map<string, string>();
    for (const c of registeredCarriers ?? []) {
      carrierNameMap.set(c.name.toLowerCase(), c.name);
    }

    // Build resolution inputs per CSV row, then dedupe by
    // (writingAgentId | "email:<email>") so each unique resolution
    // target gets exactly one async lookup. A row with no
    // writing_agent_id but a populated agent_email is keyed under
    // "email:<email>" so the email-only fallback path resolves once.
    type ResolveInput = {
      writingAgentId: string;
      agentEmail: string | null;
      carrier: string;
    };
    const uniqueInputs = new Map<string, ResolveInput>();
    // Count CSV rows that share each resolution key so the
    // Resolve Agents step can show policy counts per row.
    const policiesCountByKey = new Map<string, number>();
    for (const row of rows) {
      const { mapped } = applyColumnMapping(headers, row, columnMappings, activeCustomFields);
      const wai = mapped.writing_agent_id?.trim() ?? "";
      const email = mapped.agent_email?.trim().toLowerCase() ?? "";
      const carrier = mapped.carrier?.trim() || carrierName;
      if (!wai && !email) continue;
      // Key on writing_agent_id when present; otherwise on the email
      // for email-only rows.
      const key = wai || `email:${email}`;
      if (!uniqueInputs.has(key)) {
        uniqueInputs.set(key, {
          writingAgentId: wai,
          agentEmail: email || null,
          carrier,
        });
      }
      policiesCountByKey.set(key, (policiesCountByKey.get(key) ?? 0) + 1);
    }

    // Compute downline scope for non-owners. Owners can import for anyone in
    // the tenant; managers are constrained to agents in their downline tree.
    const isOwnerImporter = currentAgent.is_owner === true;
    const downlineIds = isOwnerImporter
      ? null
      : computeDownlineAgentIds(currentAgent.email, agents ?? []);

    // Resolve each unique input
    const resolutions: AgentResolutionRow[] = [];
    for (const [key, input] of uniqueInputs) {
      const result = await resolveAgent(
        input.writingAgentId,
        input.agentEmail,
        input.carrier,
        currentAgent.tenant_id,
        supabase,
        carrierNameMap
      );
      const outOfScope =
        downlineIds != null &&
        result.agentId != null &&
        !downlineIds.has(result.agentId);
      resolutions.push({
        writingAgentId: input.writingAgentId,
        agentEmail: input.agentEmail,
        carrier: input.carrier,
        resolvedAgentId: result.agentId,
        resolvedAgentName: result.agentName ?? null,
        method: result.method,
        manualAgentId: "",
        saveAsAlias: false,
        conflict: result.conflict,
        outOfScope,
        policiesCount: policiesCountByKey.get(key) ?? 0,
      });
    }

    setAgentResolutions(resolutions);
    setResolving(false);
    setStep(2);
  }, [currentAgent, rows, headers, columnMappings, customFields, autoCustomFields, carrierName]);

  /* ---------- Step 3 -> 4: Validate ---------- */
  const proceedToValidation = useCallback(() => {
    // Build resolution lookup, including any unresolved conflict signal.
    // Per the new canonical rule (writing-number-first, email-fallback,
    // no auto-assign on conflict), conflicts return agentId=null and the
    // owner picks via the override dropdown — so the warning here is
    // softer than before.
    type ResolutionMapEntry = {
      agentId: string | null;
      method: string | null;
      reasons: string[];
      warning?: string;
    };
    const byWai = new Map<string, ResolutionMapEntry>();
    const byEmail = new Map<string, ResolutionMapEntry>();
    for (const r of agentResolutions) {
      const agentId = r.manualAgentId || r.resolvedAgentId;
      const method = r.manualAgentId ? "manual" : r.method;
      const reasons: string[] = [];
      let warning: string | undefined;
      // A manual override resolves a conflict; only flag if no override.
      if (r.conflict && !r.manualAgentId) {
        reasons.push("agent_conflict");
        warning =
          "Writing number and email pointed to different agents. Pick one via the override dropdown.";
      }
      const entry = { agentId, method, reasons, warning };
      if (r.writingAgentId) {
        byWai.set(r.writingAgentId, entry);
      }
      if (r.agentEmail) {
        byEmail.set(r.agentEmail.toLowerCase(), entry);
      }
    }

    const activeCustomFields = [
      ...customFields,
      ...autoCustomFields.filter((f) => f.checked).map((f) => f.field),
    ];

    const built: ImportRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const { mapped, customFieldValues } = applyColumnMapping(
        headers,
        rows[i],
        columnMappings,
        activeCustomFields
      );

      // Apply carrier name if not in mapping
      if (!mapped.carrier?.trim() && carrierName) {
        mapped.carrier = carrierName;
      }

      const { errors, warnings } = validateImportRow(mapped, effectiveStatusMap);

      // Resolve agent: writing_agent_id first (the canonical key), email
      // fallback when wai is missing or unresolved.
      const wai = mapped.writing_agent_id?.trim();
      const email = mapped.agent_email?.trim().toLowerCase();
      let resolvedAgentId: string | null = null;
      let resolutionMethod: string | null = null;
      const needsReviewReasons: string[] = [];
      let res: ResolutionMapEntry | undefined;
      if (wai && byWai.has(wai)) {
        res = byWai.get(wai);
      } else if (email && byEmail.has(email)) {
        res = byEmail.get(email);
      }
      if (res) {
        resolvedAgentId = res.agentId;
        resolutionMethod = res.method;
        if (res.warning) warnings.push(res.warning);
        for (const reason of res.reasons) needsReviewReasons.push(reason);
      }

      built.push({
        rowIndex: i,
        mapped,
        customFieldValues,
        resolvedAgentId,
        resolutionMethod,
        errors,
        warnings,
        needsReviewReasons,
      });
    }

    // In-CSV duplicate policy_number detection. Surface as a warning on
    // every row past the first occurrence so the owner sees the issue
    // before clicking Confirm Import. The current import path (after
    // the composite-fallback fix) will still collapse genuine duplicates
    // because the second row's policy_number lookup hits the first row
    // and updates it; the warning is the user's signal to fix the CSV
    // or accept last-wins. A future picker (keep first / keep last /
    // skip) is tracked separately.
    const policyNumberFirstSeen = new Map<string, number>();
    for (const row of built) {
      const pn = row.mapped.policy_number?.trim();
      if (!pn) continue;
      if (!policyNumberFirstSeen.has(pn)) {
        policyNumberFirstSeen.set(pn, row.rowIndex);
        continue;
      }
      const firstAt = policyNumberFirstSeen.get(pn)!;
      row.warnings.push(
        `Duplicate policy_number "${pn}" in CSV (first seen at row ${firstAt + 1}). Last row will overwrite earlier rows on import.`
      );
      row.needsReviewReasons.push("duplicate_policy_number_in_csv");
    }

    setImportRows(built);
    setStep(3);
  }, [rows, headers, columnMappings, customFields, autoCustomFields, carrierName, agentResolutions, effectiveStatusMap]);

  /* ---------- Step 4: Inline status picker handlers ---------- */

  /**
   * Apply an inline picker selection. Adds the override locally so the
   * row counts recompute immediately, and (if save is checked) persists
   * the mapping to the carrier profile via the
   * update_carrier_status_mapping RPC. The same raw value is implicitly
   * resolved across every row of the current import because everything
   * downstream reads from effectiveStatusMap.
   */
  const applyStatusMapping = useCallback(
    async (rawValue: string, canonical: CanonicalStatus, save: boolean) => {
      const key = normalizeStatusKey(rawValue);
      setStatusOverrides((prev) => ({ ...prev, [key]: canonical }));
      // If user toggled the row from skipped back to mapped, drop the skip flag.
      setSkippedStatuses((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });

      if (save && carrierName) {
        const { error } = await supabase.rpc("update_carrier_status_mapping" as any, {
          p_carrier_name: carrierName,
          p_raw_value: rawValue.trim(),
          p_canonical_value: canonical,
        });
        if (error) {
          toast.error(`Saved for this import only. Could not save to carrier profile: ${error.message}`);
        } else {
          queryClient.invalidateQueries({ queryKey: ["carrierProfiles"] });
        }
      }
    },
    [carrierName, queryClient]
  );

  /** Mark all rows with the given raw status as skip-on-import. */
  const skipStatusValue = useCallback((rawValue: string) => {
    const key = normalizeStatusKey(rawValue);
    setSkippedStatuses((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setStatusOverrides((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

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
      flaggedForReview: 0,
    };

    // Build a per-writing-agent-id lookup of the manager scope flag so we can
    // skip out-of-scope rows. A manager's manual override may have moved a
    // row into scope — only treat it as out-of-scope if the FINAL resolution
    // (including override) lands on a non-downline agent.
    const downlineIdsForImport = currentAgent.is_owner
      ? null
      : computeDownlineAgentIds(currentAgent.email, agents ?? []);

    const toImport = validRows;
    const total = toImport.length;

    for (let i = 0; i < toImport.length; i++) {
      const row = toImport[i];
      const m = row.mapped;

      try {
        // Orphan path (per Wiki/carrier-ingest-pipeline.md 2026-05-02
        // refinement): when the row has a writing number but no
        // contract match AND the importer is the owner, deposit the
        // row with resolved_agent_id NULL. The auto-link trigger on
        // agent_contracts will attach it later when the contract gets
        // added. Non-owner managers fall back to the existing
        // assign-to-importer behavior because the policies INSERT RLS
        // (owner-only) blocks orphan inserts from non-owners.
        const isOrphan = row.resolutionMethod === "orphan" && currentAgent.is_owner === true;
        const resolvedAgentId: string | null = isOrphan
          ? null
          : (row.resolvedAgentId || currentAgent.id);

        // Manager scope: skip if final resolution is outside their downline.
        // Orphans skip this guard (resolvedAgentId is null and only the
        // owner reaches this branch).
        if (
          resolvedAgentId !== null &&
          downlineIdsForImport != null &&
          !downlineIdsForImport.has(resolvedAgentId)
        ) {
          result.skipped++;
          setImportProgress(Math.round(((i + 1) / total) * 100));
          continue;
        }

        // Resolve via the effective per-import map so picker overrides
        // and per-carrier status_value_map both apply at write time.
        const resolved = m.status ? resolveStatus(m.status, effectiveStatusMap) : null;
        const status: string = resolved ?? "Submitted";
        const rawPremium = m.annual_premium ? cleanCurrency(m.annual_premium) : 0;
        const rawRefsCollected = m.refs_collected ? parseInt(m.refs_collected, 10) : 0;
        const rawRefsSold = m.refs_sold ? parseInt(m.refs_sold, 10) : 0;

        let premiumToUpsert = rawPremium;
        let refsCollectedToUpsert = rawRefsCollected;
        let refsSoldToUpsert = rawRefsSold;
        let previousStatus: string | null = null;
        const reviewReasons = [...row.needsReviewReasons];

        // ===== Match resolution: policy_number primary, composite fallback =====
        type ExistingPolicyRow = {
          id: string;
          status: string;
          annual_premium: number | null;
          refs_collected: number | null;
          refs_sold: number | null;
        };
        let existingRow: ExistingPolicyRow | null = null;

        if (m.policy_number?.trim()) {
          const { data } = await supabase
            .from("policies")
            .select("id, status, annual_premium, refs_collected, refs_sold")
            .eq("policy_number", m.policy_number.trim())
            .eq("tenant_id", currentAgent.tenant_id)
            .maybeSingle();
          if (data) existingRow = data as ExistingPolicyRow;
        }

        // Composite fallback ONLY when policy_number is genuinely missing
        // from the CSV. The unique key for a policy is (tenant_id,
        // policy_number) per Wiki/schema-spec.md; if a row has a
        // policy_number we trust it as the authoritative identifier.
        //
        // Prior bug: this fallback fired any time the policy_number lookup
        // returned NULL, including for brand-new policy_numbers not yet in
        // the DB. That collapsed legitimate distinct policies that
        // happened to share writing_agent_id + client_name + carrier +
        // application_date — most commonly the "family bundle" case where
        // one agent writes multiple products (term + IUL + accident) for
        // the same client on the same date with different policy_numbers.
        // Each row past the first matched the previously inserted row via
        // the composite query and silently overwrote it.
        if (!existingRow && !m.policy_number?.trim()) {
          const wai = m.writing_agent_id?.trim();
          const cli = m.client_name?.trim();
          const car = m.carrier?.trim();
          const appDate = m.application_date?.trim();
          if (wai && cli && car && appDate) {
            const { data } = await supabase
              .from("policies")
              .select("id, status, annual_premium, refs_collected, refs_sold")
              .eq("tenant_id", currentAgent.tenant_id)
              .eq("writing_agent_id", wai)
              .eq("client_name", cli)
              .eq("carrier", car)
              .eq("application_date", appDate);

            const matches = (data ?? []) as ExistingPolicyRow[];
            if (matches.length === 1) {
              existingRow = matches[0];
            } else if (matches.length > 1) {
              reviewReasons.push("ambiguous_composite_match");
            } else {
              reviewReasons.push("composite_match_failed");
            }
          } else {
            // No policy_number AND insufficient composite key fields.
            reviewReasons.push("no_policy_number");
          }
        }

        if (existingRow) {
          previousStatus = existingRow.status;
          if (importMode === "additive") {
            premiumToUpsert = (existingRow.annual_premium || 0) + rawPremium;
            refsCollectedToUpsert = (existingRow.refs_collected || 0) + rawRefsCollected;
            refsSoldToUpsert = (existingRow.refs_sold || 0) + rawRefsSold;
          }
        }

        // ===== Payload construction =====
        // For UPDATE: only include fields with non-empty CSV values so blank
        // cells preserve existing DB values. For INSERT: include nulls for
        // missing fields so the new row is well-formed.
        const isExistingRow = !!existingRow;
        // agent_number is the denormalized writing number on the
        // policy row that the auto_link_orphan_policies trigger keys
        // off of. For resolved rows we still populate it so future
        // contract edits (e.g. correcting an agent_number on a
        // contract) stay consistent. For orphan rows it's the only
        // signal the trigger has to attach the policy later.
        const payload: Record<string, unknown> = {
          tenant_id: currentAgent.tenant_id,
          policy_number: m.policy_number?.trim() || null,
          status,
          annual_premium: premiumToUpsert,
          refs_collected: refsCollectedToUpsert,
          refs_sold: refsSoldToUpsert,
          resolved_agent_id: resolvedAgentId,
          writing_agent_id: m.writing_agent_id?.trim() || null,
          agent_number: m.writing_agent_id?.trim() || null,
        };

        const setIfPresentOrInsert = (key: string, value: string | null | undefined) => {
          const trimmed = typeof value === "string" ? value.trim() : value;
          if (trimmed) {
            payload[key] = trimmed;
          } else if (!isExistingRow) {
            payload[key] = null;
          }
        };

        setIfPresentOrInsert("application_date", m.application_date);
        setIfPresentOrInsert("client_name", m.client_name);
        setIfPresentOrInsert("client_phone", m.client_phone);
        setIfPresentOrInsert("client_dob", m.client_dob);
        setIfPresentOrInsert("carrier", m.carrier);
        setIfPresentOrInsert("product", m.product);
        setIfPresentOrInsert("contract_type", m.contract_type);
        setIfPresentOrInsert("lead_source", m.lead_source);
        setIfPresentOrInsert("effective_date", m.effective_date);
        setIfPresentOrInsert("notes", m.notes);

        if (Object.keys(row.customFieldValues).length > 0) {
          payload.custom_fields = row.customFieldValues;
        } else if (!isExistingRow) {
          payload.custom_fields = {};
        }

        // needs_review: only stamp when there's a fresh reason this run.
        // Don't unset an already-true flag from a prior run.
        if (reviewReasons.length > 0) {
          payload.needs_review = true;
          payload.needs_review_reasons = Array.from(new Set(reviewReasons));
        } else if (!isExistingRow) {
          payload.needs_review = false;
          payload.needs_review_reasons = [];
        }

        // ===== Write =====
        let policy: { id: string } | null = null;
        let error: { message: string } | null = null;
        if (existingRow) {
          const { data, error: updErr } = await supabase
            .from("policies")
            .update(payload as any)
            .eq("id", existingRow.id)
            .select("id")
            .single();
          policy = data as { id: string } | null;
          error = updErr;
        } else {
          const { data, error: insErr } = await supabase
            .from("policies")
            .insert(payload as any)
            .select("id")
            .single();
          policy = data as { id: string } | null;
          error = insErr;
        }

        if (error) {
          result.skipped++;
          continue;
        }

        result.imported++;
        if (reviewReasons.length > 0) {
          result.flaggedForReview++;
        }

        // Calculate payouts
        if (policy) {
          try {
            await calculateAndSavePayouts(policy.id, supabase);
            result.payoutsCalculated++;
          } catch {}

          // Webhook fire on transition into Booked or Realized buckets.
          // policy.issued     fires when status moves into Issued (or
          //                   the deprecated Active alias) from anything else.
          // policy.issue_paid fires when status moves into Issue Paid.
          // The legacy deal.posted event keeps firing on Issued for
          // back-compat with existing tenant subscriptions.
          // TODO: drop 'Active' branch after Active enum drop.
          const wasIssued = previousStatus === "Issued" || previousStatus === "Active";
          const becameIssued = (status === "Issued" || status === "Active") && !wasIssued;
          const becameIssuePaid = status === "Issue Paid" && previousStatus !== "Issue Paid";
          if (becameIssued || becameIssuePaid) {
            const eventName = becameIssuePaid ? "policy.issue_paid" : "policy.issued";
            const eventTypes: any[] = becameIssuePaid
              ? [eventName]
              : [eventName, "deal.posted"];
            const { data: activeWebhooks } = await supabase
              .from("webhook_configs")
              .select("webhook_url, event_type")
              .eq("tenant_id", currentAgent.tenant_id)
              .eq("is_active", true)
              .in("event_type", eventTypes);

            const webhooks = (activeWebhooks ?? []) as Array<{ webhook_url: string; event_type: string }>;
            const agent = agents?.find((a) => a.id === resolvedAgentId);

            for (const config of webhooks) {
              try {
                await supabase.functions.invoke("fire-webhook", {
                  body: {
                    webhook_url: config.webhook_url,
                    payload: {
                      event: config.event_type === "deal.posted" ? "deal.posted" : eventName,
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
        const { error } = await supabase.from("carrier_agent_aliases").upsert(
          {
            tenant_id: currentAgent.tenant_id,
            carrier: r.carrier,
            writing_agent_id: r.writingAgentId,
            agent_id: r.manualAgentId,
          } as any,
          { onConflict: "tenant_id,carrier,writing_agent_id" as any, ignoreDuplicates: false }
        );
        if (!error) result.aliasesSaved++;
      } catch {}
    }

    queryClient.invalidateQueries({ queryKey: ["policies"] });
    queryClient.invalidateQueries({ queryKey: ["commissionPayouts"] });

    setImportResult(result);
    setImporting(false);
    setStep(4);
    onImportComplete?.(result);
  }, [currentAgent, validRows, agentResolutions, agents, queryClient, importMode, onImportComplete, effectiveStatusMap]);

  /* ---------- Save carrier profile ---------- */
  const handleSaveProfile = useCallback(() => {
    if (!carrierName.trim()) {
      toast.error("Enter a carrier name to save the profile");
      return;
    }
    const activeCustomFields = [
      ...customFields,
      ...autoCustomFields.filter((f) => f.checked).map((f) => f.field),
    ];
    createProfile.mutate({
      carrier_name: carrierName.trim(),
      column_mappings: columnMappings,
      custom_fields: activeCustomFields,
      header_fingerprint: headers,
    });
  }, [carrierName, columnMappings, customFields, autoCustomFields, headers, createProfile]);

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
  /*  Post-import: "orphan policies — pick agent" panel                */
  /*                                                                   */
  /*  Surfaces writing numbers that imported as orphans (resolved_     */
  /*  agent_id NULL). Owner picks an agent per writing number; the     */
  /*  wizard inserts the matching agent_contracts row, the auto-link   */
  /*  trigger fires, and every orphan policy with that writing number  */
  /*  attaches in the same transaction.                                */
  /* ---------------------------------------------------------------- */
  const orphanCandidates = useMemo(() => {
    return agentResolutions
      .filter((r) => !!r.writingAgentId && r.method === "orphan" && !r.manualAgentId)
      .map((r) => ({
        writingAgentId: r.writingAgentId,
        carrier: r.carrier,
      }));
  }, [agentResolutions]);

  // Per-orphan agent picker state. Map<writingAgentId, agentId | "">.
  const [orphanAgentPicks, setOrphanAgentPicks] = useState<Record<string, string>>({});

  const handleLinkOrphans = useCallback(async () => {
    if (!currentAgent) return;
    const rowsToInsert = orphanCandidates
      .filter((c) => orphanAgentPicks[c.writingAgentId])
      .map((c) => ({
        tenant_id: currentAgent.tenant_id,
        agent_id: orphanAgentPicks[c.writingAgentId],
        carrier: c.carrier,
        agent_number: c.writingAgentId,
        contract_type: "Direct Pay",
        status: "Active",
      }));
    if (rowsToInsert.length === 0) {
      setNewContractsState("done");
      return;
    }
    setNewContractsState("saving");
    const { error } = await supabase.from("agent_contracts").insert(rowsToInsert as any);
    if (error) {
      toast.error(`Could not add ${rowsToInsert.length} contracts: ${error.message}`);
      setNewContractsState("idle");
      return;
    }
    // The auto_link_orphan_policies trigger fires per inserted row.
    // Invalidate everything: orphans just attached server-side, every
    // aggregation that reads policies needs to recompute.
    queryClient.invalidateQueries();
    toast.success(
      `${rowsToInsert.length} writing number(s) linked. Matching orphan policies attached automatically.`
    );
    setNewContractsState("done");
  }, [currentAgent, orphanCandidates, orphanAgentPicks, queryClient]);

  const handleSkipNewContracts = useCallback(() => {
    setNewContractsState("done");
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  // Gate: if user cannot import, don't render
  if (!canImport) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent
        className="
          w-screen h-[100dvh] max-w-none max-h-none rounded-none p-4 gap-3
          md:w-auto md:h-auto md:max-w-4xl md:max-h-[90vh] md:rounded-lg md:p-6 md:gap-4
          overflow-y-auto
        "
      >
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
                  {carrierOptions.length === 0 ? (
                    // Hard block per the carrier roster inheritance fix.
                    // Free-text was letting imports set carrier strings
                    // that did not match any tenant carrier and silently
                    // disconnected the imported policies from the roster.
                    <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                      No carriers configured. Ask the owner to add carriers on{" "}
                      <a href="/carriers" className="underline font-medium">Carriers and Comp Sheets</a>.
                    </div>
                  ) : (
                    <Select value={carrierName} onValueChange={setCarrierName}>
                      <SelectTrigger><SelectValue placeholder="Select carrier" /></SelectTrigger>
                      <SelectContent>
                        {carrierOptions.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                disabled={!fileName || rows.length === 0 || carrierOptions.length === 0 || !carrierName}
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

            {autoCustomFields.length > 0 && (
              <div className="space-y-2 mt-6">
                <p className="text-xs font-medium text-foreground">Auto-detected Carrier Fields</p>
                <div className="grid grid-cols-2 gap-2">
                  {autoCustomFields.map((acf, i) => (
                    <div key={i} className="flex items-center space-x-2">
                      <Checkbox
                        id={`acf-${i}`}
                        checked={acf.checked}
                        onCheckedChange={(val) => {
                          setAutoCustomFields((prev) => 
                            prev.map((p, idx) => idx === i ? { ...p, checked: !!val } : p)
                          );
                        }}
                      />
                      <label htmlFor={`acf-${i}`} className="text-xs truncate">{acf.field.label}</label>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">
                {agentResolutions.filter((r) => r.resolvedAgentId || r.manualAgentId).length} of{" "}
                {agentResolutions.length} agent IDs resolved
                {agentResolutions.filter((r) => r.method === "orphan" && !r.manualAgentId).length > 0 && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">
                    ({agentResolutions.filter((r) => r.method === "orphan" && !r.manualAgentId).length} will import as unassigned)
                  </span>
                )}
              </p>
              {agentResolutions.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {agentResolutions.length} writing number{agentResolutions.length === 1 ? "" : "s"} covering{" "}
                  {agentResolutions.reduce((s, r) => s + r.policiesCount, 0)} policies in this upload.
                </p>
              )}
              {agentResolutions.some((r) => r.method === "orphan" && !r.manualAgentId) && (
                <p className="text-xs text-muted-foreground">
                  Unassigned rows still import. Add the writing number to the right agent's contracts later (or use the override) to auto-link them.
                </p>
              )}
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
                      // Prefer the JOIN-sourced name from resolveAgent
                      // (fixes the MOO-74291 display bug where the
                      // cached useAgents() list was missing the agent
                      // even though the contract match succeeded).
                      // Fall back to the agents cache only when the
                      // JOIN didn't surface a name (e.g. manual override).
                      const cachedAgent = agents?.find((a) => a.id === resolved);
                      const resolvedAgentDisplay =
                        r.resolvedAgentName ??
                        (cachedAgent ? `${cachedAgent.first_name} ${cachedAgent.last_name}`.trim() : null);
                      const isOrphanPending = r.method === "orphan" && !r.manualAgentId;
                      return (
                        <TableRow key={r.writingAgentId || `email:${r.agentEmail ?? ""}`}>
                          <TableCell className="text-xs font-mono align-top">
                            <div>{r.writingAgentId || (r.agentEmail ? <span className="italic text-muted-foreground">{r.agentEmail}</span> : "—")}</div>
                            <div className={cn(
                              "text-[10px] mt-0.5",
                              isOrphanPending ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                            )}>
                              {r.policiesCount} {r.policiesCount === 1 ? "policy" : "policies"}
                              {isOrphanPending && " (will be unassigned)"}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{r.carrier}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {r.manualAgentId ? (
                                <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-800">
                                  manual
                                </Badge>
                              ) : r.method === "orphan" ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-amber-100 text-amber-800"
                                  title="Will import as unassigned. Add this writing number to the right agent's contracts later (or use the override below) to auto-link the orphan policies."
                                >
                                  orphan pending
                                </Badge>
                              ) : r.method ? (
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "text-[10px]",
                                    r.resolvedAgentId ? "bg-green-100 text-green-800" : ""
                                  )}
                                >
                                  {r.method}
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[10px]">
                                  unresolved
                                </Badge>
                              )}
                              {r.conflict && !r.manualAgentId && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-yellow-100 text-yellow-800"
                                  title="Email and writing-number lookups returned different agents. Defaulted to email match — use the override to confirm or correct."
                                >
                                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> conflict
                                </Badge>
                              )}
                              {r.outOfScope && !r.manualAgentId && (
                                <Badge
                                  variant="destructive"
                                  className="text-[10px]"
                                  title="Outside your downline. Owner-only import. Use the override to map this writing agent to someone in your downline, or this row will be skipped."
                                >
                                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> out of scope
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {resolvedAgentDisplay ?? (r.method === "orphan" ? (
                              <span className="text-muted-foreground italic">(unassigned)</span>
                            ) : "--")}
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

            {/* Inline status picker — shown only when there are unmapped carrier statuses */}
            {unmappedStatusValues.length > 0 && (
              <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-500/30 p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {unmappedStatusValues.length} carrier status{unmappedStatusValues.length === 1 ? "" : "es"} need mapping
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Match each carrier value to one of the six canonical statuses. Saving the mapping teaches the system for next time.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="picker-save-default"
                    checked={pickerSaveDefault}
                    onCheckedChange={(v) => setPickerSaveDefault(v === true)}
                  />
                  <Label htmlFor="picker-save-default" className="text-xs cursor-pointer">
                    Save these mappings for all future {carrierName || "carrier"} imports
                  </Label>
                </div>

                <div className="space-y-2">
                  {unmappedStatusValues.map((rawValue) => (
                    <StatusPickerRow
                      key={normalizeStatusKey(rawValue)}
                      rawValue={rawValue}
                      onApply={(canonical) => applyStatusMapping(rawValue, canonical, pickerSaveDefault)}
                      onSkip={() => skipStatusValue(rawValue)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* When everything is resolved or skipped, show a brief confirmation banner. */}
            {unmappedStatusValues.length === 0 && skippedStatuses.size > 0 && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                {skippedStatuses.size} status value{skippedStatuses.size === 1 ? "" : "s"} skipped. Rows with those statuses will not be imported.
              </div>
            )}

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
                  {effectiveImportRows.slice(0, 100).map((r) => {
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
            {effectiveImportRows.length > 100 && (
              <p className="text-xs text-muted-foreground">
                Showing first 100 of {effectiveImportRows.length} rows
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
              <Button
                onClick={executeImport}
                disabled={validRows.length === 0 || unmappedStatusValues.length > 0}
              >
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

                {/* Post-import: orphan policies — pick agent. */}
                {newContractsState !== "done" && orphanCandidates.length > 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {orphanCandidates.length} writing number(s) imported as unassigned
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Pick an agent for each. Adding the contract auto-attaches every matching orphan policy.
                      </p>
                    </div>
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {orphanCandidates.map((entry) => (
                        <div
                          key={entry.writingAgentId}
                          className="rounded border border-border bg-background p-2 flex flex-col sm:flex-row sm:items-center gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono text-foreground">{entry.writingAgentId}</p>
                            <p className="text-[10px] text-muted-foreground">{entry.carrier}</p>
                          </div>
                          <div className="sm:w-56 shrink-0">
                            <Select
                              value={orphanAgentPicks[entry.writingAgentId] || "__none__"}
                              onValueChange={(v) =>
                                setOrphanAgentPicks((prev) => ({
                                  ...prev,
                                  [entry.writingAgentId]: v === "__none__" ? "" : v,
                                }))
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Pick agent..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">-- Skip --</SelectItem>
                                {(agents ?? []).map((a) => (
                                  <SelectItem key={a.id} value={a.id}>
                                    {a.first_name} {a.last_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSkipNewContracts}
                        disabled={newContractsState === "saving"}
                      >
                        Skip all
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleLinkOrphans}
                        disabled={
                          newContractsState === "saving" ||
                          orphanCandidates.every((c) => !orphanAgentPicks[c.writingAgentId])
                        }
                      >
                        {newContractsState === "saving"
                          ? "Linking..."
                          : `Add ${orphanCandidates.filter((c) => orphanAgentPicks[c.writingAgentId]).length} contract(s) and link orphans`}
                      </Button>
                    </div>
                  </div>
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

/* ------------------------------------------------------------------ */
/*  StatusPickerRow                                                    */
/*                                                                     */
/*  One row of the inline status-mapping picker. Renders the raw       */
/*  carrier value, a dropdown of the six canonical statuses with a     */
/*  short hint per option, and Apply / Skip actions. Stateless w.r.t   */
/*  storage — the parent owns statusOverrides and the carrier-profile  */
/*  RPC call.                                                          */
/* ------------------------------------------------------------------ */

function StatusPickerRow({
  rawValue,
  onApply,
  onSkip,
}: {
  rawValue: string;
  onApply: (canonical: CanonicalStatus) => void;
  onSkip: () => void;
}) {
  const [pick, setPick] = useState<CanonicalStatus | "">("");

  return (
    <div className="rounded-md border border-yellow-300 dark:border-yellow-500/30 bg-card p-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-2 sm:min-w-[180px]">
        <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
        <div className="text-sm">
          <p className="font-medium text-foreground break-all">"{rawValue}"</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Raw carrier value</p>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <Select value={pick} onValueChange={(v) => setPick(v as CanonicalStatus)}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Map to canonical status..." />
          </SelectTrigger>
          <SelectContent>
            {CANONICAL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                <span className="font-medium">{s}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {CANONICAL_STATUS_HINTS[s]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 shrink-0">
        <Button
          size="sm"
          onClick={() => pick && onApply(pick)}
          disabled={!pick}
        >
          Apply
        </Button>
        <Button size="sm" variant="ghost" onClick={onSkip} title="Skip rows with this status">
          Skip
        </Button>
      </div>
    </div>
  );
}
