

# Task 1: Commission Payout Smoke Test — Code Review Verdict

I cannot run actual CSV imports or take screenshots (this is a code review, not a live test). However, based on thorough code review:

**The commission engine logic is correct.** Given proper test data (agent with NPN matching `writing_agent_id`, upline chain, matching commission_levels), the flow will:
1. Policy upsert resolves `resolved_agent_id` via NPN match
2. `calculateAndSavePayouts` is called (line 265 of CSVImportModal)
3. Writing agent gets a "direct" payout row: `annual_premium * rate`
4. Upline agent gets an "override" payout row: `(upline_rate - downline_rate) * annual_premium`
5. Upsert on `(policy_id, agent_id)` prevents duplicates
6. BookOfBusiness expandable rows display the breakdown via `useCommissionPayouts({ policyId })`

**To actually verify this, you need to test it in the preview with real data.** I'll note this as a suggestion.

---

# Task 2: Bulk Recalculation — Implementation Plan

## 1. Add `recalculateAllPayouts` to `src/lib/commission-engine.ts`

Add a new exported function after the existing `calculateAndSavePayouts`:

```typescript
export async function recalculateAllPayouts(
  tenantId: string,
  supabaseClient: SupabaseClient
): Promise<{ processed: number; errors: string[] }>
```

- Fetch all policy IDs for the tenant: `supabase.from("policies").select("id").eq("tenant_id", tenantId)`
- Loop through each, call `calculateAndSavePayouts(policyId, supabaseClient)` in a try/catch
- Track processed count and error messages
- Return `{ processed, errors }`

## 2. Add "Recalculate All Payouts" button to Settings Danger Zone

In `src/pages/Settings.tsx`, add a new section in the danger zone card (before "Delete All Policies"):

- Button labeled "Recalculate All Payouts"
- On click: calls `recalculateAllPayouts(currentAgent.tenant_id, supabase)`
- Shows toast with result: `"Recalculated {count} policies"` or error details
- Loading state while processing

**Files changed:**
- `src/lib/commission-engine.ts` — add `recalculateAllPayouts` function
- `src/pages/Settings.tsx` — add recalculate button in danger zone

