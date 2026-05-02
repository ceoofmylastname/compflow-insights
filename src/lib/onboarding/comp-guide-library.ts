// Curated public-comp-guide library shown in onboarding Step 3.
//
// Per Wiki/carriers-and-comp-sheets-page.md (Path 2: vendor-assisted from
// public comp guides), agencies that run on a publicly published
// compensation structure can be onboarded faster by selecting a curated
// preset. This file is the read-only reference list the wizard renders.
//
// Selecting a curated preset in the wizard creates the carrier row only
// (with `name`, `short_name`). The actual `commission_levels` rows are
// NOT seeded here per the prompt's guardrail ("Do NOT auto-create comp
// grids"). The owner fills them in later on the Carriers and Comp Sheets
// page, optionally importing from the FFL/IUL/Term comp template.

export interface CompGuide {
  /** Stable id used by the wizard radio group. */
  id: string;
  /** Display name shown in the picker. */
  name: string;
  /** What gets written to `carriers.short_name`. */
  shortName: string;
  /** One-line description of what this guide covers. */
  description: string;
}

export const COMP_GUIDE_LIBRARY: CompGuide[] = [
  {
    id: "transamerica",
    name: "Transamerica",
    shortName: "Transamerica",
    description: "FE Express, Final Expense Solutions, Trendsetter LB.",
  },
  {
    id: "mutual-of-omaha",
    name: "Mutual of Omaha",
    shortName: "MutualOfOmaha",
    description: "Living Promise, Term Life Express, GUL Express.",
  },
  {
    id: "aetna",
    name: "Aetna",
    shortName: "Aetna",
    description: "Accendo (Modified), Express IUL, Simply Term.",
  },
  {
    id: "americo",
    name: "Americo",
    shortName: "Americo",
    description: "Eagle Premier, Continuation, HMS Plus.",
  },
  {
    id: "aflac",
    name: "Aflac",
    shortName: "Aflac",
    description: "Final Expense, Term Life, Whole Life.",
  },
  {
    id: "gerber",
    name: "Gerber Life",
    shortName: "Gerber",
    description: "Guaranteed Life, Term Life, College Plan.",
  },
  {
    id: "foresters",
    name: "Foresters Financial",
    shortName: "Foresters",
    description: "PlanRight FE, Strong Foundation, Your Term.",
  },
  {
    id: "sbli",
    name: "SBLI",
    shortName: "SBLI",
    description: "Living Legacy, Term Series, Whole Life.",
  },
];
