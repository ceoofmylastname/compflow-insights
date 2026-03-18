

# Show Submitted & Issued Premium Separately in Org Chart

## Change
Update `src/components/agents/OrgTree.tsx` to fetch two policy sets and display both metrics:

1. **Add a second `usePolicies` call** with `status: ["Submitted"]` alongside the existing `status: ["Active"]` call
2. **Update SummaryBar** — replace single "Total Premium" with two items: "Submitted Premium" and "Issued Premium"
3. **Update NodeCard stats row** — change from one "Premium" cell to two: "Submitted" and "Issued", keeping the compact 2-column layout with smaller text to fit
4. **Update `AgentStats` interface** to include `submittedPrem` alongside `activePrem`

## Technical Details
- Existing query: `usePolicies({ status: ["Active"] })` → rename variable to `issuedPolicies`
- New query: `usePolicies({ status: ["Submitted"] })` → `submittedPolicies`
- `statsMap` computation adds `submittedPrem` per agent
- `SummaryBar` totals show both separately with distinct colors (emerald for issued, sky for submitted)
- NodeCard stats grid changes from 3-col (Premium | Comm | Reports) to 4-col (Submitted | Issued | Comm | Reports)

## Files Changed
- `src/components/agents/OrgTree.tsx` — update queries, stats computation, SummaryBar, and NodeCard

