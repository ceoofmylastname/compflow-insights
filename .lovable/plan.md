

# Fix 3 Bugs from E2E Audit

## Fix 1: Invite URL param mismatch (Critical)
**File**: `src/pages/AgentRoster.tsx` line 112
Change `?token=${token}` → `?invite=${token}`

## Fix 2: React Fragment missing key
**File**: `src/pages/BookOfBusiness.tsx` line 162
Change `<>` → `<React.Fragment key={policy.id}>` and the closing `</>` → `</React.Fragment>`. Move the `key` from `TableRow` (line 164) since it's now on the Fragment.

## Fix 3: Commission Levels duplicate prevention
Two changes:

1. **Database migration**: Add unique constraint on `commission_levels(tenant_id, carrier, product, position, start_date)`

2. **File**: `src/components/shared/CSVImportModal.tsx` line 249
Change `.insert(records)` → `.upsert(records, { onConflict: "tenant_id,carrier,product,position,start_date", ignoreDuplicates: true })`

No other files affected. Three targeted edits + one migration.

