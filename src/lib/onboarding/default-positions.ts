// Default 9-position blueprint seeded into the onboarding wizard.
//
// Mirrors the AgentView "blueprint" convention from
// Wiki/positions-and-blueprint.md: lower priority numbers sit higher on
// the ladder. Owners can rename, reorder, or add positions inside the
// wizard before saving. Save inserts these into the `positions` table.

export interface DefaultPosition {
  title: string;
  priority: number;
}

export const DEFAULT_POSITIONS: DefaultPosition[] = [
  { title: "CEO / Owner",       priority: 10 },
  { title: "Senior Vice President", priority: 20 },
  { title: "Vice President",    priority: 30 },
  { title: "Regional Director", priority: 40 },
  { title: "Director",          priority: 50 },
  { title: "Senior Manager",    priority: 60 },
  { title: "Manager",           priority: 70 },
  { title: "Senior Agent",      priority: 80 },
  { title: "Agent",             priority: 90 },
];
