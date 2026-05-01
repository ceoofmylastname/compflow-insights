import type { Agent } from "@/hooks/useAgents";

export type AgentRole = "Owner" | "Manager" | "Agent";

/**
 * Resolve an agent's role label.
 *
 *   Owner   — agents.is_owner = true
 *   Manager — has at least one downline agent (some agent's upline_email === this agent's email)
 *   Agent   — everyone else
 *
 * The "Manager" label is computed at runtime, not stored, so a producer who
 * gets their first downline auto-promotes in the UI without a flag flip.
 */
export function getAgentRole(
  agent: Pick<Agent, "email" | "is_owner">,
  allAgents: Array<Pick<Agent, "upline_email">>
): AgentRole {
  if (agent.is_owner) return "Owner";
  const hasDownline = allAgents.some((a) => a.upline_email === agent.email);
  return hasDownline ? "Manager" : "Agent";
}
