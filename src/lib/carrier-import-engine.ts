import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanCurrency, autoMapFields } from "@/lib/csv-utils";
import { parseISO, isValid, addDays } from "date-fns";
import {
  buildStatusMap,
  resolveStatus,
  CANONICAL_STATUSES,
  type CanonicalStatus,
} from "@/lib/carrier-status-mapping";

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
  /**
   * Carrier-specific mapping from raw status values ("Issued",
   * "Issue Paid", ...) to canonical policies.status enum values.
   * Lookup is case-insensitive and whitespace-trimmed via
   * normalizeKey from @/lib/carrier-status-mapping.
   */
  status_value_map?: Record<string, string> | null;
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
  method: "alias" | "npn" | "contract" | "email" | "manual" | "orphan" | null;
  /**
   * Populated when the resolver matched an existing agent — used by the
   * wizard's display so the Resolved Agent column shows the name even
   * when the cached `useAgents()` list misses (archived agent, stale
   * cache, cross-page navigation). Authoritative source: the JOIN done
   * inside resolveAgent itself.
   */
  agentName?: string | null;
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
  "agent_email",
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
 * Resolve a CSV row's writing_agent_id (and optional agent_email) to an
 * actual agent UUID.
 *
 * Canonical priority per Wiki/carrier-ingest-pipeline.md (refined
 * 2026-05-02 — orphan-and-auto-link variant):
 *
 *   1. Manual alias on `carrier_agent_aliases` — explicit human override
 *      wins outright. method: 'alias'.
 *   2. Writing-number match on agent_contracts (tenant + carrier +
 *      agent_number). method: 'contract'. JOINs agents to surface the
 *      name in agentName so the wizard display does not depend on the
 *      cached useAgents() list.
 *   3. Writing number on row but no contract match → ORPHAN. Returns
 *      agentId: null, method: 'orphan'. The wizard imports the row
 *      with resolved_agent_id NULL and agent_number populated; the
 *      auto-link Postgres trigger attaches it later when the right
 *      contract is added. Email is NOT consulted in this branch (per
 *      the user directive 2026-05-02 — owner picks via override OR
 *      adds the contract; no silent email fallback).
 *   4. No writing number on row → email_in_agents fallback. method:
 *      'email'. The carrier-statement-without-writing-number edge case.
 *   5. Conflict — writing number resolved to one agent, email resolved
 *      to a DIFFERENT agent. (Only reachable when wai is present AND
 *      contract matched AND email also resolved to a different agent.
 *      Per the orphan rule above, contract-match wins so this case
 *      collapses to method='contract'; the conflict block is here as a
 *      safety net.)
 *   6. NPN last-resort — some carrier feeds put the NPN in the
 *      writing_agent_id column. Only consulted when no writing-number
 *      contract match AND no email match. method: 'npn'.
 */
export async function resolveAgent(
  writingAgentId: string,
  agentEmail: string | null,
  carrier: string,
  tenantId: string,
  supabaseClient: SupabaseClient,
  carrierNameMap?: Map<string, string>
): Promise<AgentResolutionResult> {
  const wai = writingAgentId.trim();
  const email = agentEmail?.trim().toLowerCase() ?? "";

  // Nothing to resolve at all.
  if (!wai && !email) return { agentId: null, method: null };

  const normalizedCarrier = carrierNameMap
    ? normalizeCarrierName(carrier, carrierNameMap)
    : carrier;

  const nameOf = async (id: string): Promise<string | null> => {
    const { data } = await supabaseClient
      .from("agents")
      .select("first_name, last_name")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const fn = (data as { first_name: string | null; last_name: string | null }).first_name ?? "";
    const ln = (data as { first_name: string | null; last_name: string | null }).last_name ?? "";
    const full = `${fn} ${ln}`.trim();
    return full.length > 0 ? full : null;
  };

  // 1. Manual alias — explicit human override wins. Only meaningful
  //    when a writing_agent_id is present.
  if (wai) {
    const { data: alias } = await supabaseClient
      .from("carrier_agent_aliases")
      .select("agent_id")
      .eq("tenant_id", tenantId)
      .eq("carrier", normalizedCarrier)
      .eq("writing_agent_id", wai)
      .maybeSingle();
    if (alias?.agent_id) {
      return {
        agentId: alias.agent_id,
        method: "alias",
        agentName: await nameOf(alias.agent_id),
      };
    }
  }

  // 2. Writing-number match on agent_contracts. JOIN agents so the
  //    display name comes from the source-of-truth join, not the
  //    client cache. (Fixes the MOO-74291 display bug where the
  //    Resolved Agent column showed "--" despite a green contract
  //    badge — the cached useAgents() list missed the agent.)
  if (wai) {
    const { data: contractRow } = await supabaseClient
      .from("agent_contracts")
      .select("agent_id, agents:agent_id (first_name, last_name)")
      .eq("tenant_id", tenantId)
      .eq("carrier", normalizedCarrier)
      .eq("agent_number", wai)
      .maybeSingle();

    if (contractRow?.agent_id) {
      const agentRow = (contractRow as unknown as {
        agent_id: string;
        agents: { first_name: string | null; last_name: string | null } | null;
      }).agents;
      const fullName = agentRow
        ? `${agentRow.first_name ?? ""} ${agentRow.last_name ?? ""}`.trim()
        : "";
      return {
        agentId: contractRow.agent_id,
        method: "contract",
        agentName: fullName.length > 0 ? fullName : null,
      };
    }

    // 3. Writing number present but unmatched → ORPHAN. Per the
    //    refined rule (user directive 2026-05-02), do NOT consult
    //    email here. The row imports with resolved_agent_id NULL and
    //    agent_number = wai; the auto-link trigger attaches it once
    //    the contract is added.
    return { agentId: null, method: "orphan" };
  }

  // 4. No writing number on the CSV row at all → email fallback.
  //    Owner-uploaded statements that omit writing numbers entirely
  //    rely on this path.
  if (email) {
    const { data: emailRow } = await supabaseClient
      .from("agents")
      .select("id, first_name, last_name")
      .eq("tenant_id", tenantId)
      .eq("email", email)
      .maybeSingle();
    if (emailRow?.id) {
      const r = emailRow as { id: string; first_name: string | null; last_name: string | null };
      const fullName = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
      return {
        agentId: r.id,
        method: "email",
        agentName: fullName.length > 0 ? fullName : null,
      };
    }
  }

  // 6. NPN last-resort. Only fires when wai-as-NPN is the last hope.
  //    (Reachable only when wai was unset above, since the wai branch
  //    short-circuits to 'orphan' after the contract miss.)
  if (wai) {
    const { data: byNpn } = await supabaseClient
      .from("agents")
      .select("id, first_name, last_name")
      .eq("tenant_id", tenantId)
      .eq("npn", wai)
      .maybeSingle();
    if (byNpn?.id) {
      const r = byNpn as { id: string; first_name: string | null; last_name: string | null };
      const fullName = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
      return {
        agentId: r.id,
        method: "npn",
        agentName: fullName.length > 0 ? fullName : null,
      };
    }
  }

  return { agentId: null, method: null };
}

/* ------------------------------------------------------------------ */
/*  Row Validation                                                     */
/* ------------------------------------------------------------------ */

/**
 * Sentinel prefix for the "unknown carrier status" warning. The Validate
 * step grep-matches this prefix to drive the inline picker, so the wizard
 * UX and the validator stay coupled through a single string. Any change
 * here also requires updating PolicyImportWizard.
 */
export const UNMAPPED_STATUS_WARNING_PREFIX = "Unmapped status:";

export function validateImportRow(
  mapped: Record<string, string>,
  /**
   * Effective map (defaults + per-carrier overrides + session overrides).
   * Built once per validation pass via buildStatusMap. When omitted, only
   * the platform defaults are used.
   */
  statusMap?: Record<string, CanonicalStatus>
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
    const effectiveMap = statusMap ?? buildStatusMap(null);
    const canonical = resolveStatus(mapped.status, effectiveMap);
    if (!canonical || !CANONICAL_STATUSES.includes(canonical)) {
      warnings.push(`${UNMAPPED_STATUS_WARNING_PREFIX} "${mapped.status.trim()}"`);
    }
  }

  return { errors, warnings };
}

/* ------------------------------------------------------------------ */
/*  Build Import Rows (orchestrator)                                   */
/* ------------------------------------------------------------------ */

/**
 * Process all CSV rows: map columns, validate, resolve agents.
 *
 * `statusMap` is the effective per-import status lookup (built via
 * buildStatusMap from platform defaults + carrier_profiles.status_value_map
 * + any in-session overrides from the inline picker). Pass null for
 * defaults-only.
 */
export async function buildImportRows(
  headers: string[],
  rows: string[][],
  mappings: Record<string, string>,
  customFields: CustomField[],
  tenantId: string,
  supabaseClient: SupabaseClient,
  statusMap?: Record<string, CanonicalStatus>
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

    const { errors, warnings } = validateImportRow(mapped, statusMap);

    // Resolve agent
    let resolvedAgentId: string | null = null;
    let resolutionMethod: string | null = null;

    // Per Wiki/carrier-ingest-pipeline.md (2026-05-02): writing-number
    // first, email fallback. Resolve when either column has data.
    if (mapped.carrier?.trim() && (mapped.writing_agent_id?.trim() || mapped.agent_email?.trim())) {
      const result = await resolveAgent(
        mapped.writing_agent_id ?? "",
        mapped.agent_email ?? null,
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
