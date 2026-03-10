

# Final Polish Pass — 4 Tasks

## Task 1: Dashboard Commission Trend Chart

Add a `CommissionTrendChart` component below the stat cards in `src/pages/Dashboard.tsx`.

- Use existing `payouts` data (already fetched), filter to `payout_type === "direct"` and `agent_id === currentAgent.id`
- For each payout, fetch the related policy's `application_date` via a dedicated inline query: `supabase.from("commission_payouts").select("*, policies(application_date)").eq("agent_id", currentAgent.id).eq("payout_type", "direct")`
- Group by month (last 12 months from today), sum `commission_amount`
- Render with recharts `LineChart`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`
- X-axis: month labels (Jan, Feb...), Y-axis: dollar amounts via `formatCurrency`
- Wrap in a Card with title "Commission Trend"

**File**: `src/pages/Dashboard.tsx` — add chart between GoalProgress and RecentPolicies

## Task 2: Policy Status Update in Book of Business

Add an inline status `<Select>` dropdown to each policy row's Status column (owners only). Non-owners see the existing `StatusBadge`.

- On change: update `policies` table with new status, then call `calculateAndSavePayouts(policyId, supabase)` to re-trigger commission/webhook logic
- Invalidate `policies` and `commissionPayouts` queries
- Use `stopPropagation` on the Select click to prevent row expansion toggle
- Need `useCurrentAgent` to check `is_owner`

**File**: `src/pages/BookOfBusiness.tsx` — modify status column render, add mutation logic

## Task 3: Agent Roster Improvements

The roster already has all requested columns (NPN, Position, Contract Type, Start Date, Annual Goal, Upline resolved to name). Two additions needed:

1. **Inline Annual Goal edit** (owners only): Replace the Annual Goal cell with an editable input. On blur/enter, update `agents` table and invalidate. Use `currentAgent?.is_owner` guard.

2. **"Copy Invite Link" button** per row: Add a dropdown menu item that generates a new invite token (insert into `invites` table), builds the URL `${window.location.origin}/signup?token={token}`, and copies to clipboard via `navigator.clipboard.writeText`. No modal needed.

**File**: `src/pages/AgentRoster.tsx` — modify Annual Goal column render, add Copy Invite Link to dropdown

## Task 4: CSV Import Validation Hardening

Enhance the `handleValidate` function in `CSVImportModal.tsx` for the policies tab:

**New validations before adding to `valid`**:
- `application_date`: must be a valid date, not more than 90 days in the future
- `annual_premium`: must be a positive number > 0
- `policy_number`: must not be empty (already checked)
- `carrier` and `product`: must not be empty
- `writing_agent_id` unresolved: already tracked via `unresolvedRows` — change behavior to **skip** these rows from `validRows` and move them to a new "skipped" category

**Enhanced validation UI**:
- In the `validate` step, show a preview table of all rows with a status column: green checkmark for valid, red X for errors, amber warning for unresolved agent
- Unresolved rows get a distinct amber background with the failure reason in a new column
- Error rows show red background with reason

**Import summary (done step)**:
- Show: `{imported} rows imported, {skipped} rows skipped (unresolved agent), {errors} rows with validation errors`
- List first 5 skip reasons

**File**: `src/components/shared/CSVImportModal.tsx` — enhance `handleValidate`, update validate/done step UI

## Files Changed

- `src/pages/Dashboard.tsx` — add commission trend line chart
- `src/pages/BookOfBusiness.tsx` — add inline status dropdown for owners
- `src/pages/AgentRoster.tsx` — inline goal edit, copy invite link
- `src/components/shared/CSVImportModal.tsx` — validation hardening + enhanced summary UI

No database changes needed.

