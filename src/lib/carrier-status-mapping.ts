// Carrier-status -> canonical-status resolution.
//
// Canonical statuses (the only values policies.status may take) are:
//   Draft, Submitted, Pending, Active, Terminated, Potential Lapse
//
// Carriers ship statements with their own vocabulary ("Issued", "Issue
// Paid", "First Year Paid", "Free Look", etc.). Per Wiki/schema-spec.md
// §carrier_field_mappings, the translation lives in
// carrier_profiles.status_value_map — a JSONB { rawValue: canonical }
// dictionary keyed per carrier.
//
// Lookup order:
//   1. Per-carrier overrides (status_value_map on the matched carrier_profiles row)
//   2. Platform-default seed (seeds/carrier-status-mappings.json)
//   3. Pass-through if the raw value already matches a canonical status
//   4. Otherwise unresolved -> the wizard surfaces an inline picker
//
// All matching is case-insensitive and whitespace-trimmed.

import seed from "../../seeds/carrier-status-mappings.json";

export const CANONICAL_STATUSES = [
  "Draft",
  "Submitted",
  "Pending",
  "Active",
  "Terminated",
  "Potential Lapse",
] as const;

export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];

/** One-line UI hint per canonical status, surfaced next to the dropdown. */
export const CANONICAL_STATUS_HINTS: Record<CanonicalStatus, string> = {
  Draft: "Saved but not yet submitted to the carrier",
  Submitted: "Sent to the carrier, awaiting review",
  Pending: "Submitted but not yet issued (underwriting / free look)",
  Active: "Policy is issued and inforce",
  Terminated: "Policy is closed (lapsed, surrendered, declined, withdrawn)",
  "Potential Lapse": "Past due or in grace period; may terminate soon",
};

/** Read-only platform default mapping, lower-cased and trimmed for lookup. */
export const DEFAULT_STATUS_MAP: Readonly<Record<string, CanonicalStatus>> = (() => {
  const raw = (seed as { mappings: Record<string, string> }).mappings;
  const out: Record<string, CanonicalStatus> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (CANONICAL_STATUSES.includes(val as CanonicalStatus)) {
      out[normalizeKey(key)] = val as CanonicalStatus;
    }
  }
  // Belt and suspenders: every canonical also maps to itself.
  for (const c of CANONICAL_STATUSES) out[normalizeKey(c)] = c;
  return Object.freeze(out);
})();

/** Lower-case + collapse internal whitespace to a single space + trim. */
export function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Build the effective lookup map for a single import session.
 *
 * Layers (last write wins):
 *   1. Platform defaults
 *   2. Per-carrier overrides from carrier_profiles.status_value_map
 *   3. In-session overrides from the inline picker (before they're saved
 *      back to the profile)
 */
export function buildStatusMap(
  perCarrier: Record<string, string> | null | undefined,
  sessionOverrides: Record<string, CanonicalStatus> = {}
): Record<string, CanonicalStatus> {
  const merged: Record<string, CanonicalStatus> = { ...DEFAULT_STATUS_MAP };

  if (perCarrier) {
    for (const [key, val] of Object.entries(perCarrier)) {
      if (CANONICAL_STATUSES.includes(val as CanonicalStatus)) {
        merged[normalizeKey(key)] = val as CanonicalStatus;
      }
    }
  }

  for (const [key, val] of Object.entries(sessionOverrides)) {
    merged[normalizeKey(key)] = val;
  }

  return merged;
}

/** Resolve a raw carrier status to a canonical value or null if unmapped. */
export function resolveStatus(
  raw: string | null | undefined,
  effectiveMap: Record<string, CanonicalStatus>
): CanonicalStatus | null {
  if (!raw || !raw.trim()) return null;
  const key = normalizeKey(raw);
  return effectiveMap[key] ?? null;
}

/** Convenience wrapper using only the platform defaults. */
export function resolveStatusWithDefaults(raw: string | null | undefined): CanonicalStatus | null {
  return resolveStatus(raw, DEFAULT_STATUS_MAP);
}
