

# Three Tasks: My Production, Dashboard Stats, Carrier Aliases

## Task 1: My Production Page Rewrite

Current state uses `useCommissionLevels` + `lookupCommissionRate` to estimate commissions. Replace with actual payout data from `commission_payouts`.

**Changes to `src/pages/MyProduction.tsx`**:
- Replace `useCommissionLevels`/`lookupCommissionRate` with `useCommissionPayouts({ agentId: currentAgent?.id })` filtered to `payout_type === "direct"` 
- Build a `commissionByPolicy` map from payouts (keyed by policy_id → { rate, amount })
- Enrich each policy row with actual commission rate and amount from this map
- Add status filter dropdown (Active/Submitted/Pending/Terminated) — currently missing
- Add summary bar with: policy count, total premium, total direct commission, goal progress % (`totalDirectCommission / annual_goal * 100`)
- Keep existing date range, carrier, contract type filters

## Task 2: Dashboard Stats Wiring

Current Dashboard already fetches payouts and policies. The stat cards need rewiring:

**Changes to `src/pages/Dashboard.tsx`**:
- **Card 1** → "Total Commission": filter `payouts` to `payout_type === "direct"` and `agent_id === currentAgent.id`, sum `commission_amount`
- **Card 2** → "Team Premium": sum `annual_premium` from all policies (already scoped by RLS to downline)
- **Card 3** → "Active Policies": count policies where `status === "Active"` (keep existing logic, just relabel)
- **Card 4** → Keep "Team Size" as-is
- **GoalProgress**: change to use direct commission total / `annual_goal` instead of premium-based
- **RecentPolicies**: already shows last policies ordered by `created_at` — update `limit` to 5

**Changes to `src/components/dashboard/RecentPolicies.tsx`**:
- Change limit from 10 to 5
- Trim columns to: client name, carrier, premium, status (remove product, writing agent, application date)

## Task 3: Carrier Aliases UI

**Changes to `src/pages/Settings.tsx`**:
- Add new tab "Carrier Aliases" (owners only) between Webhooks and Danger Zone
- New `CarrierAliasesSection` component within Settings:
  - Fetch aliases: `supabase.from("carrier_agent_aliases").select("*")` via inline `useQuery`
  - Display table: Carrier, Writing Agent ID, Resolved Agent (name from `useAgents`), Delete button
  - Add form: carrier text input, writing_agent_id input, agent selector dropdown from `useAgents`
  - On save: insert into `carrier_agent_aliases` with `tenant_id` from current agent, invalidate query
  - Delete: delete by id, invalidate query

**CSV import alias resolution** is already implemented (lines 222-236 of CSVImportModal) — it checks `carrier_agent_aliases` first, then falls back to NPN. No changes needed there.

## Files Changed

- `src/pages/MyProduction.tsx` — rewrite with actual payout data, add status filter, goal progress
- `src/pages/Dashboard.tsx` — rewire 4 stat cards to correct metrics
- `src/components/dashboard/RecentPolicies.tsx` — limit 5, trim columns
- `src/pages/Settings.tsx` — add Carrier Aliases tab with CRUD

No database changes needed — `carrier_agent_aliases` table and RLS already exist.

