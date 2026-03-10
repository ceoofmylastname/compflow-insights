

# Rebuild Scoreboard and Team Production Pages

## Scoreboard (`src/pages/Scoreboard.tsx`) — Full Rewrite

**Data source**: Use `useCommissionPayouts` with a nested Supabase select to join policy data. Update the hook to support a new query mode: `.select("*, policies(application_date, carrier, status, annual_premium)")`.

**Problem**: The current `useCommissionPayouts` hook fetches `select("*")` with no policy join. We need policy fields for filtering by application_date, carrier, and status.

**Approach**: Add a new hook `useScoreboardData` (or extend `useCommissionPayouts`) that fetches payouts with the nested policy join. Then group/aggregate client-side.

**Implementation**:
1. Create a dedicated fetch in Scoreboard that calls `supabase.from("commission_payouts").select("*, policies(application_date, carrier, status, annual_premium)")` directly (inline query, no need to modify the shared hook since this is a specialized join).
2. Client-side: filter by date range (application_date), carrier, status. Group by agent_id, sum commission_amount, count distinct policy_ids, sum annual_premium. Sort by total commission DESC.
3. Enrich with agent names from `useAgents()`.
4. Rank rows. Top 3 get gold/silver/bronze borders. Current agent row highlighted with primary color.
5. Filters: date from/to inputs, carrier `<Select>`, status `<Select>` (Active/Submitted/Pending/Terminated).
6. Export CSV button using existing `downloadCSV` from `csv-utils.ts`.

**Columns**: Rank, Agent Name, Position, Policies, Total Annual Premium, Total Commission Earned.

## Team Production (`src/pages/TeamProduction.tsx`) — Rewrite

**Data source**: Keep using `usePolicies` (RLS-scoped). Add `useCommissionPayouts` to get commission totals for the summary bar.

**Changes from current**:
- Add status filter (missing currently).
- Add contract_type column.
- Add summary bar: total policies count, total annual premium, total commission from payouts.
- Add CSV export via `exportFilename` prop on DataTable (already supported).
- Remove the commission rate lookup via `useCommissionLevels` — use actual payout data from `commission_payouts` instead.

**Filters**: date range, carrier, status, agent selector (all already partially there, just add status).

## Shared: CSV Export

Both pages already have access to `downloadCSV` from `csv-utils.ts`. DataTable already supports `exportFilename` prop. Scoreboard will need a manual export button since it uses custom aggregated data (not raw DataTable rows).

## Files Changed

- `src/pages/Scoreboard.tsx` — full rewrite
- `src/pages/TeamProduction.tsx` — rewrite with status filter, contract_type column, summary bar from payouts, remove commission_levels dependency

No database changes needed. No hook changes needed (inline query for scoreboard join).

