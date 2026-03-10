import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Upload, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useAgents } from "@/hooks/useAgents";
import { parseCSV, autoMapFields, cleanCurrency, normalizeStatus, downloadCSV, rowsToCSV } from "@/lib/csv-utils";
import { calculateAndSavePayouts } from "@/lib/commission-engine";
import { toast } from "sonner";

interface CSVImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: string;
}

type Step = "upload" | "preview" | "map" | "validate" | "importing" | "done";

const AGENT_FIELDS = ["first_name", "last_name", "email", "npn", "position", "upline_email", "start_date", "annual_goal"];
const COMMISSION_FIELDS = ["carrier", "product", "position", "rate", "start_date"];
const POLICY_FIELDS = ["policy_number", "application_date", "writing_agent_id", "client_name", "carrier", "product", "annual_premium", "status", "contract_type"];

interface UnresolvedRow {
  row: number;
  writing_agent_id: string;
  carrier: string;
}

export function CSVImportModal({ open, onOpenChange, defaultTab }: CSVImportModalProps) {
  const [tab, setTab] = useState(defaultTab || "agents");
  const [step, setStep] = useState<Step>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [validRows, setValidRows] = useState<Record<string, string>[]>([]);
  const [errorRows, setErrorRows] = useState<{ row: number; reason: string }[]>([]);
  const [unresolvedRows, setUnresolvedRows] = useState<UnresolvedRow[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);

  const { data: currentAgent } = useCurrentAgent();
  const { data: agents } = useAgents();
  const { data: commissionLevels } = useCommissionLevels();
  const queryClient = useQueryClient();

  const systemFields = tab === "agents" ? AGENT_FIELDS : tab === "commissions" ? COMMISSION_FIELDS : POLICY_FIELDS;

  const reset = () => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setFieldMapping({});
    setValidRows([]);
    setErrorRows([]);
    setUnresolvedRows([]);
    setImportProgress(0);
    setImportedCount(0);
  };

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      setCsvHeaders(headers);
      setCsvRows(rows);
      const mapping = autoMapFields(headers, systemFields);
      setFieldMapping(mapping);
      setStep("preview");
    };
    reader.readAsText(file);
  }, [systemFields]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleValidate = async () => {
    const required = systemFields;
    const errors: { row: number; reason: string }[] = [];
    const valid: Record<string, string>[] = [];
    const unresolved: UnresolvedRow[] = [];

    const records: { record: Record<string, string>; idx: number }[] = [];

    csvRows.forEach((row, idx) => {
      const record: Record<string, string> = {};
      let hasError = false;
      for (const field of required) {
        const csvCol = fieldMapping[field];
        if (!csvCol) {
          if (["first_name", "last_name", "email", "carrier", "product", "position", "rate", "start_date", "policy_number", "application_date", "writing_agent_id", "client_name", "annual_premium", "status"].includes(field)) {
            errors.push({ row: idx + 2, reason: `Missing mapping for ${field}` });
            hasError = true;
            break;
          }
          continue;
        }
        const colIdx = csvHeaders.indexOf(csvCol);
        record[field] = colIdx >= 0 ? (row[colIdx] || "").trim() : "";
      }
      if (!hasError) {
        if (tab === "agents" && (!record.first_name || !record.last_name || !record.email)) {
          errors.push({ row: idx + 2, reason: "Missing required field (name or email)" });
        } else if (tab === "commissions" && (!record.carrier || !record.product || !record.rate)) {
          errors.push({ row: idx + 2, reason: "Missing required field" });
        } else if (tab === "policies" && (!record.policy_number || !record.client_name)) {
          errors.push({ row: idx + 2, reason: "Missing policy_number or client_name" });
        } else {
          records.push({ record, idx });
        }
      }
    });

    // For policies, resolve writing_agent_id via alias → NPN fallback
    if (tab === "policies") {
      for (const { record, idx } of records) {
        if (record.writing_agent_id && record.carrier) {
          // 1. Check carrier_agent_aliases
          const { data: alias } = await supabase
            .from("carrier_agent_aliases" as any)
            .select("agent_id")
            .eq("carrier", record.carrier)
            .eq("writing_agent_id", record.writing_agent_id)
            .maybeSingle();

          if (alias) {
            record._resolved_agent_id = (alias as any).agent_id;
          } else {
            // 2. Fallback to NPN
            const npnMatch = agents?.find((a) => a.npn === record.writing_agent_id);
            if (npnMatch) {
              record._resolved_agent_id = npnMatch.id;
            } else {
              // 3. Unresolved
              unresolved.push({
                row: idx + 2,
                writing_agent_id: record.writing_agent_id,
                carrier: record.carrier,
              });
            }
          }
        }
        valid.push(record);
      }
    } else {
      for (const { record } of records) {
        valid.push(record);
      }
    }

    setValidRows(valid);
    setErrorRows(errors);
    setUnresolvedRows(unresolved);
    setStep("validate");
  };

  const handleImport = async () => {
    if (!currentAgent) return;
    setStep("importing");
    const tenantId = currentAgent.tenant_id;
    let imported = 0;

    try {
      if (tab === "agents") {
        for (let i = 0; i < validRows.length; i++) {
          const r = validRows[i];
          const { error } = await supabase.from("agents").upsert(
            {
              tenant_id: tenantId,
              first_name: r.first_name,
              last_name: r.last_name,
              email: r.email,
              npn: r.npn || null,
              position: r.position || null,
              upline_email: r.upline_email || null,
              start_date: r.start_date || null,
              annual_goal: r.annual_goal ? parseFloat(r.annual_goal) : null,
              is_owner: false,
            },
            { onConflict: "email,tenant_id", ignoreDuplicates: false }
          );
          if (!error) imported++;
          setImportProgress(((i + 1) / validRows.length) * 100);
        }
      } else if (tab === "commissions") {
        const records = validRows.map((r) => ({
          tenant_id: tenantId,
          carrier: r.carrier,
          product: r.product,
          position: r.position,
          rate: parseFloat(r.rate.replace("%", "")) / 100,
          start_date: r.start_date,
        }));
        const { error } = await supabase.from("commission_levels").insert(records);
        if (!error) imported = records.length;
        setImportProgress(100);
      } else if (tab === "policies") {
        // Fetch all active deal.posted webhooks upfront
        const { data: activeWebhooks } = await supabase
          .from("webhook_configs")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .eq("event_type", "deal.posted" as any);
        const webhooks = (activeWebhooks ?? []) as Array<{ webhook_url: string }>;

        for (let i = 0; i < validRows.length; i++) {
          const r = validRows[i];

          // Use pre-resolved agent ID from validation, or resolve again
          let resolvedAgentId: string | null = r._resolved_agent_id || null;

          if (!resolvedAgentId && r.writing_agent_id && r.carrier) {
            const { data: alias } = await supabase
              .from("carrier_agent_aliases" as any)
              .select("agent_id")
              .eq("carrier", r.carrier)
              .eq("writing_agent_id", r.writing_agent_id)
              .maybeSingle();

            if (alias) {
              resolvedAgentId = (alias as any).agent_id;
            } else if (agents) {
              const match = agents.find((a) => a.npn === r.writing_agent_id);
              if (match) resolvedAgentId = match.id;
            }
          }

          const premium = cleanCurrency(r.annual_premium || "0");
          const status = normalizeStatus(r.status || "Submitted");

          const { data: policy, error } = await supabase
            .from("policies")
            .upsert(
              {
                tenant_id: tenantId,
                policy_number: r.policy_number,
                application_date: r.application_date || null,
                writing_agent_id: r.writing_agent_id || null,
                resolved_agent_id: resolvedAgentId,
                client_name: r.client_name,
                carrier: r.carrier || null,
                product: r.product || null,
                annual_premium: premium,
                status,
                contract_type: r.contract_type || null,
              },
              { onConflict: "policy_number,tenant_id", ignoreDuplicates: false }
            )
            .select()
            .single();

          if (!error && policy && resolvedAgentId && commissionLevels) {
            const agent = agents?.find((a) => a.id === resolvedAgentId);
            const rate = lookupCommissionRate(
              commissionLevels,
              r.carrier,
              agent?.position || null,
              r.application_date
            );
            if (rate != null) {
              await supabase.from("commission_payouts").upsert(
                {
                  tenant_id: tenantId,
                  policy_id: policy.id,
                  agent_id: resolvedAgentId,
                  commission_rate: rate,
                  commission_amount: premium * rate,
                },
                { onConflict: "policy_id,agent_id", ignoreDuplicates: false }
              );
            }

            if (status === "Active" && webhooks.length > 0) {
              const webhookPayload = {
                event: "deal.posted",
                policy_number: r.policy_number || "",
                client_name: r.client_name || "",
                carrier: r.carrier || "",
                product: r.product || "",
                annual_premium: premium,
                agent_email: agent?.email || "",
                application_date: r.application_date || "",
                status,
              };
              for (const config of webhooks) {
                try {
                  await supabase.functions.invoke("fire-webhook", {
                    body: { webhook_url: config.webhook_url, payload: webhookPayload },
                  });
                } catch {}
              }
            }
          }
          if (!error) imported++;
          setImportProgress(((i + 1) / validRows.length) * 100);
        }
      }

      setImportedCount(imported);
      setStep("done");
      queryClient.invalidateQueries();
      toast.success(`Import complete — ${imported} rows imported, ${errorRows.length} skipped`);
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
      setStep("validate");
    }
  };

  const handleDownloadErrors = () => {
    const headers = ["Row", "Reason"];
    const rows = errorRows.map((e) => [String(e.row), e.reason]);
    downloadCSV("import-errors.csv", rowsToCSV(headers, rows));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => { setTab(v); reset(); }}>
          <TabsList className="w-full">
            <TabsTrigger value="agents" className="flex-1">Agent Roster</TabsTrigger>
            <TabsTrigger value="commissions" className="flex-1">Commission Levels</TabsTrigger>
            <TabsTrigger value="policies" className="flex-1">Policy Report</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="space-y-4 mt-4">
            {step === "upload" && (
              <div
                className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:border-primary transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".csv";
                  input.onchange = (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) handleFile(f);
                  };
                  input.click();
                }}
              >
                <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Drag & drop a CSV file here, or click to select
                </p>
              </div>
            )}

            {step === "preview" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Preview — first 5 rows of {csvRows.length} total
                </p>
                <div className="overflow-x-auto rounded border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {csvHeaders.map((h) => (
                          <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvRows.slice(0, 5).map((row, i) => (
                        <TableRow key={i}>
                          {row.map((cell, j) => (
                            <TableCell key={j} className="whitespace-nowrap">{cell}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button onClick={() => setStep("map")}>Next: Map Fields</Button>
              </div>
            )}

            {step === "map" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Map CSV columns to system fields</p>
                <div className="grid grid-cols-2 gap-3">
                  {systemFields.map((field) => (
                    <div key={field} className="flex items-center gap-2">
                      <span className="text-sm font-medium w-36 shrink-0">{field}</span>
                      <Select
                        value={fieldMapping[field] || ""}
                        onValueChange={(v) =>
                          setFieldMapping((m) => ({ ...m, [field]: v }))
                        }
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                          {csvHeaders.map((h) => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <Button onClick={handleValidate}>Validate</Button>
              </div>
            )}

            {step === "validate" && (
              <div className="space-y-4">
                <div className="flex gap-4 flex-wrap">
                  <div className="flex items-center gap-2 text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm">{validRows.length} rows ready</span>
                  </div>
                  {unresolvedRows.length > 0 && (
                    <div className="flex items-center gap-2 text-amber-500">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm">{unresolvedRows.length} unresolved agent{unresolvedRows.length !== 1 ? "s" : ""}</span>
                    </div>
                  )}
                  {errorRows.length > 0 && (
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">{errorRows.length} rows have errors</span>
                    </div>
                  )}
                </div>

                {unresolvedRows.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border border-amber-300 dark:border-amber-700 rounded p-2 text-xs space-y-1 bg-amber-50 dark:bg-amber-950/30">
                    <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">
                      These rows will import without a resolved agent (no alias or NPN match):
                    </p>
                    {unresolvedRows.slice(0, 20).map((u, i) => (
                      <p key={i} className="text-amber-600 dark:text-amber-400">
                        Row {u.row}: writing_agent_id "{u.writing_agent_id}" / carrier "{u.carrier}" — no matching agent found
                      </p>
                    ))}
                    {unresolvedRows.length > 20 && (
                      <p className="text-muted-foreground">...and {unresolvedRows.length - 20} more</p>
                    )}
                  </div>
                )}

                {errorRows.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border border-border rounded p-2 text-xs space-y-1">
                    {errorRows.slice(0, 20).map((e, i) => (
                      <p key={i} className="text-destructive">
                        Row {e.row}: {e.reason}
                      </p>
                    ))}
                    {errorRows.length > 20 && (
                      <p className="text-muted-foreground">...and {errorRows.length - 20} more</p>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  {errorRows.length > 0 && (
                    <Button variant="outline" size="sm" onClick={handleDownloadErrors}>
                      Download Error Report
                    </Button>
                  )}
                  <Button onClick={handleImport} disabled={validRows.length === 0}>
                    Confirm Import ({validRows.length} rows)
                  </Button>
                </div>
              </div>
            )}

            {step === "importing" && (
              <div className="space-y-4 py-8">
                <p className="text-sm text-center text-muted-foreground">Importing...</p>
                <Progress value={importProgress} className="h-2" />
              </div>
            )}

            {step === "done" && (
              <div className="space-y-4 py-8 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
                <p className="text-lg font-semibold text-foreground">Import Complete</p>
                <p className="text-sm text-muted-foreground">
                  {importedCount} rows imported, {errorRows.length} skipped
                </p>
                <Button onClick={() => { reset(); onOpenChange(false); }}>Close</Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
