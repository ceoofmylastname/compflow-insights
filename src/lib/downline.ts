import type { Agent } from "@/hooks/useAgents";

/**
 * Compute the set of agent IDs that sit anywhere below `viewerEmail` in the
 * tenant hierarchy tree. Walks the agents list breadth-first using the
 * `upline_email` chain.
 *
 * NOTE: this is the first place in the codebase that materializes the
 * downline scope set. The wiki (csv-upload-matching-and-routing.md) specifies
 * downline-scoped import permissions, but no existing code computes the
 * descendant set. This helper is the authoritative source going forward — if
 * you need a downline check elsewhere (Scoreboard, Production, payroll
 * filters), reuse this rather than re-rolling.
 *
 * The viewer themselves is NOT included in the result. Use a union with
 * `[viewerId]` if "self + downline" semantics are needed.
 */
export function computeDownlineAgentIds(
  viewerEmail: string | null | undefined,
  allAgents: Array<Pick<Agent, "id" | "email" | "upline_email">>
): Set<string> {
  const result = new Set<string>();
  if (!viewerEmail) return result;

  let frontier = new Set<string>([viewerEmail]);
  // Defensive cap: a healthy hierarchy is at most a few dozen levels.
  // Without this, a circular upline_email chain would loop forever.
  let depth = 0;
  while (frontier.size > 0 && depth < 100) {
    const next = new Set<string>();
    for (const a of allAgents) {
      if (a.upline_email && frontier.has(a.upline_email) && !result.has(a.id)) {
        result.add(a.id);
        next.add(a.email);
      }
    }
    frontier = next;
    depth++;
  }

  return result;
}
