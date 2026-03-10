

# Commission Payout Calculation Engine

## Database Migration

Add two new columns to `commission_payouts`:
- `payout_type TEXT NOT NULL DEFAULT 'direct'` — values: `"direct"` or `"override"`
- `contract_type TEXT` — values: `"Direct Pay"`, `"LOA"`, or null

The unique constraint on `(policy_id, agent_id)` already exists.

## New File: `src/lib/commission-engine.ts`

Export `calculateAndSavePayouts(policyId: string, supabaseClient)`:

1. Fetch the policy by ID (get carrier, product, application_date, annual_premium, resolved_agent_id, tenant_id)
2. Fetch all agents for the tenant (need position, upline_email, email, contract_type, start_date)
3. Fetch all commission_levels for the tenant (sorted by start_date DESC)
4. Find the writing agent by resolved_agent_id. Confirm their start_date <= application_date. Look up their rate from commission_levels matching carrier + product + position + start_date <= application_date (first match = most recent active rate)
5. Calculate direct payout: `annual_premium * rate`. Insert with `payout_type: "direct"`, `contract_type: agent.contract_type`
6. Walk the upline chain: find upline by `upline_email`, look up their rate for the same carrier/product/position. Override amount = `(upline_rate - downline_rate) * annual_premium`. If override > 0, insert with `payout_type: "override"`. Set downline_rate = upline_rate for next iteration. Stop when upline_email is null
7. All inserts use upsert on `(policy_id, agent_id)` to avoid duplicates

## Update CSVImportModal

Replace the inline commission calculation (lines 262-281) with a call to `calculateAndSavePayouts(policy.id, supabase)`. Keep the webhook trigger logic after it.

## Update `useCommissionPayouts` Hook

- Change query to fetch payouts with agent name join (or fetch agents separately and merge client-side since RLS makes joins complex)
- Add `policyId` filter option for the expandable row use case
- Return payout_type, contract_type, commission_rate, commission_amount, and agent name

## Update `BookOfBusiness.tsx`

- Add expandable rows: clicking a policy row toggles a sub-table showing all commission_payouts for that policy
- Sub-table columns: Agent Name, Position, Rate, Amount, Payout Type (direct/override), Contract Type
- Use a `Collapsible` or simple state toggle per row
- Fetch payouts for the expanded policy using `useCommissionPayouts({ policyId })`

## Files Changed

- New migration: add `payout_type` and `contract_type` to `commission_payouts`
- New: `src/lib/commission-engine.ts`
- Edit: `src/components/shared/CSVImportModal.tsx` (replace inline calc with engine call)
- Edit: `src/hooks/useCommissionPayouts.ts` (add policyId filter, return new fields)
- Edit: `src/pages/BookOfBusiness.tsx` (expandable payout rows)

