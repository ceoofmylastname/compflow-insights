import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanCurrency, normalizeStatus, autoMapFields } from "@/lib/csv-utils";
import { parseISO, isValid, addDays } from "date-fns";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CarrierProfile {
  id: string;
  tenant_id: string;
  carrier_name: string;
  column_mappings: Record<string, string>;
  custom_fields: CustomField[];
  header_fingerprint: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface CustomField {
  label: string;
  type: "text" | "number" | "date";
  csvColumn: string;
}

export interface ImportRow {
  rowIndex: number;
  mapped: Record<string, string>;
  customFieldValues: Record<string, string>;
  resolvedAgentId: string | null;
  resolutionMethod: string | null;
  errors: string[];
  warnings: string[];
  /**
   * Reasons the imported row should be flagged for human review on Book of
   * Business. Examples: "agent_conflict" (email vs writing_number disagree),
   * "ambiguous_policy_match" (composite fallback hit multiple rows).
   */
  needsReviewReasons: string[];
}

export interface AgentResolutionResult {
  agentId: string | null;
  method: "alias" | "npn" | "contract" | "email" | "manual" | null;
  /**
   * Populated when the email and writing-number lookups succeeded but
   * pointed to DIFFERENT agents. The wizard surfaces this as a yellow
   * warning in Step 4 and writes needs_review=true on the imported row.
   */
  conflict?: {
    emailAgentId: string;
    writingNumberAgentId: string;
  };
}

/** System fields the wizard maps CSV columns to. */
export const SYSTEM_FIELDS = [
  "policy_number",
  "application_date",
  "writing_agent_id",
  "client_name",
  "client_phone",
  "client_dob",
  "carrier",
  "product",
  "annual_premium",
  "status",
  "contract_type",
  "lead_source",
  "effective_date",
  "notes",
  "refs_collected",
  "refs_sold",
] as const;

export type SystemField = (typeof SYSTEM_FIELDS)[number];

/* ------------------------------------------------------------------ */
/*  Carrier Auto-Detection                                             */
/* ------------------------------------------------------------------ */

/**
 * Match CSV headers against saved carrier profiles using header fingerprints.
 * Returns the best-matching profile or null.
 */
export function detectCarrierFromHeaders(
  csvHeaders: string[],
  profiles: CarrierProfile[]
): CarrierProfile | null {
  if (profiles.length === 0 || csvHeaders.length === 0) return null;

  const normalizedCsv = new Set(csvHeaders.map((h) => h.toLowerCase().trim()));
  let bestMatch: CarrierProfile | null = null;
  let bestScore = 0;

  for (const profile of profiles) {
    if (!profile.header_fingerprint || profile.header_fingerprint.length === 0)
      continue;

    const fingerprint = profile.header_fingerprint.map((h) =>
      h.toLowerCase().trim()
    );
    const matchCount = fingerprint.filter((h) => normalizedCsv.has(h)).length;
    const score = matchCount / fingerprint.length;

    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = profile;
    }
  }

  return bestMatch;
}

/* ------------------------------------------------------------------ */
/*  Column Mapping                                                     */
/* ------------------------------------------------------------------ */

/**
 * Apply column mappings to a single CSV row.
 * `mappings` maps system field names -> CSV header names.
 */
export function applyColumnMapping(
  headers: string[],
  row: string[],
  mappings: Record<string, string>,
  customFields: CustomField[]
): { mapped: Record<string, string>; customFieldValues: Record<string, string> } {
  const headerIndex = new Map(headers.map((h, i) => [h, i]));

  const mapped: Record<string, string> = {};
  for (const [systemField, csvHeader] of Object.entries(mappings)) {
    const idx = headerIndex.get(csvHeader);
    if (idx != null && idx < row.length) {
      mapped[systemField] = row[idx].trim();
    }
  }

  const customFieldValues: Record<string, string> = {};
  for (const cf of customFields) {
    const idx = headerIndex.get(cf.csvColumn);
    if (idx != null && idx < row.length) {
      customFieldValues[cf.label] = row[idx].trim();
    }
  }

  return { mapped, customFieldValues };
}

/**
 * Auto-generate initial column mappings by fuzzy-matching CSV headers to system fields.
 */
export function autoMapColumns(csvHeaders: string[]): Record<string, string> {
  return autoMapFields(csvHeaders, [...SYSTEM_FIELDS]);
}

/* ------------------------------------------------------------------ */
/*  Carrier Name Normalization                                         */
/* ------------------------------------------------------------------ */

/**
 * Normalize a carrier name to its canonical form from the carriers registry.
 * Uses a pre-built map of lowercase → canonical names.
 */
export function normalizeCarrierName(
  carrier: string,
  carrierNameMap: Map<string, string>
): string {
  return carrierNameMap.get(carrier.toLowerCase().trim()) ?? carrier;
}

/* ------------------------------------------------------------------ */
/*  Agent Resolution (4-step chain)                                    */
/* ------------------------------------------------------------------ */

/**
 * Resolve a writing_agent_id string to an actual agent UUID.
 *
 * Resolution order (per project CLAUDE.md):
 *  1. Manual alias on `carrier_agent_aliases` — if a human has explicitly
 *     mapped this carrier+writing_agent_id to an agent, that wins outright.
 *  2. Email AND writing-number (carrier-scoped agent_contracts.agent_number)
 *     are looked up in parallel. If both hit the SAME agent → assign. If
 *     both hit DIFFERENT agents → flag a conflict for manual review (the
 *     spec is "email first, writing number second" — so the conflict.assignment
 *     defaults to the email match, but the row gets needs_review).
 *  3. NPN fallback — only consulted if neither email nor writing number
 *     matched. Some carrier feeds put the NPN in the writing_agent_id column.
 */
export async function resolveAgent(
  writingAgentId: string,
  carrier: string,
  tenantId: string,
  supabaseClient: SupabaseClient,
  carrierNameMap?: Map<string, string>
): Promise<AgentResolutionResult> {
  if (!writingAgentId.trim()) return { agentId: null, method: null };

  const val = writingAgentId.trim();
  const normalizedCarrier = carrierNameMap
    ? normalizeCarrierName(carrier, carrierNameMap)
    : carrier;

  // 1. Manual alias — explicit human override wins
  const { data: alias } = await supabaseClient
    .from("carrier_agent_aliases")
    .select("agent_id")
    .eq("tenant_id", tenantId)
    .eq("carrier", normalizedCarrier)
    .eq("writing_agent_id", val)
    .maybeSingle();

  if (alias?.agent_id) {
    return { agentId: alias.agent_id, method: "alias" };
  }

  // 2. Email + writing-number in parallel — conflict detection
  const [emailRes, contractRes] = await Promise.all([
    supabaseClient
      .from("agents")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", val)
      .maybeSingle(),
    supabaseClient
      .from("agent_contracts")
      .select("agent_id")
      .eq("tenant_id", tenantId)
      .eq("carrier", normalizedCarrier)
      .eq("agent_number", val)
      .maybeSingle(),
  ]);

  const emailAgentId = emailRes.data?.id ?? null;
  const writingNumberAgentId = contractRes.data?.agent_id ?? null;

  if (emailAgentId && writingNumberAgentId) {
    if (emailAgentId === writingNumberAgentId) {
      return { agentId: emailAgentId, method: "email" };
    }
    // Both resolved but to different agents — flag conflict.
    // Default assignment: email per spec primacy. Row will be marked
    // needs_review by the wizard.
    return {
      agentId: emailAgentId,
      method: "email",
      conflict: { emailAgentId, writingNumberAgentId },
    };
  }
  if (emailAgentId) {
    return { agentId: emailAgentId, method: "email" };
  }
  if (writingNumberAgentId) {
    return { agentId: writingNumberAgentId, method: "contract" };
  }

  // 3. NPN fallback — last resort, used by carrier feeds that put NPN
  //    in the writing_agent_id column.
  const { data: byNpn } = await supabaseClient
    .from("agents")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("npn", val)
    .maybeSingle();

  if (byNpn?.id) {
    return { agentId: byNpn.id, method: "npn" };
  }

  return { agentId: null, method: null };
}

/* ------------------------------------------------------------------ */
/*  Row Validation                                                     */
/* ------------------------------------------------------------------ */

export function validateImportRow(
  mapped: Record<string, string>,
  rowIndex: number
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // policy_number is preferred but not required — when missing, the import
  // engine attempts a composite fallback match (writing_agent_id + client_name
  // + carrier + application_date) and flags the row needs_review either way.
  if (!mapped.policy_number?.trim()) {
    warnings.push("Missing policy number — will be flagged for review");
  }

  if (!mapped.client_name?.trim()) {
    errors.push("Missing client name");
  }

  if (!mapped.carrier?.trim()) {
    errors.push("Missing carrier");
  }

  if (!mapped.product?.trim()) {
    errors.push("Missing product");
  }

  if (mapped.annual_premium) {
    const prem = cleanCurrency(mapped.annual_premium);
    if (prem <= 0) {
      errors.push("Annual premium must be greater than 0");
    }
  } else {
    errors.push("Missing annual premium");
  }

  if (mapped.application_date) {
    const d = parseISO(mapped.application_date);
    if (!isValid(d)) {
      warnings.push("Invalid application date format");
    } else if (d > addDays(new Date(), 90)) {
      warnings.push("Application date is more than 90 days in the future");
    }
  }

  if (mapped.status) {
    const normalized = normalizeStatus(mapped.status);
    if (!["Active", "Submitted", "Pending", "Terminated"].includes(normalized)) {
      warnings.push(`Unknown status: "${mapped.status}"`);
    }
  }

  return { errors, warnings };
}

/* ------------------------------------------------------------------ */
/*  Build Import Rows (orchestrator)                                   */
/* ------------------------------------------------------------------ */

/**
 * Process all CSV rows: map columns, validate, resolve agents.
 */
export async function buildImportRows(
  headers: string[],
  rows: string[][],
  mappings: Record<string, string>,
  customFields: CustomField[],
  tenantId: string,
  supabaseClient: SupabaseClient
): Promise<ImportRow[]> {
  const importRows: ImportRow[] = [];

  // Pre-fetch carrier registry for name normalization
  const { data: registeredCarriers } = await supabaseClient
    .from("carriers")
    .select("name")
    .eq("tenant_id", tenantId);

  const carrierNameMap = new Map<string, string>();
  for (const c of registeredCarriers ?? []) {
    carrierNameMap.set(c.name.toLowerCase(), c.name);
  }

  for (let i = 0; i < rows.length; i++) {
    const { mapped, customFieldValues } = applyColumnMapping(
      headers,
      rows[i],
      mappings,
      customFields
    );

    // Normalize carrier name to canonical form
    if (mapped.carrier?.trim()) {
      mapped.carrier = normalizeCarrierName(mapped.carrier, carrierNameMap);
    }

    const { errors, warnings } = validateImportRow(mapped, i);

    // Resolve agent
    let resolvedAgentId: string | null = null;
    let resolutionMethod: string | null = null;

    if (mapped.writing_agent_id?.trim() && mapped.carrier?.trim()) {
      const result = await resolveAgent(
        mapped.writing_agent_id,
        mapped.carrier,
        tenantId,
        supabaseClient,
        carrierNameMap
      );
      resolvedAgentId = result.agentId;
      resolutionMethod = result.method;
    }

    importRows.push({
      rowIndex: i,
      mapped,
      customFieldValues,
      resolvedAgentId,
      resolutionMethod,
      errors,
      warnings,
      needsReviewReasons: [],
    });
  }

  return importRows;
}
