

# Fix: Add missing columns to policies table

## Problem
The Post a Deal form sends `billing_interval` and `modal_premium` fields, but these columns don't exist in the `policies` table. The insert fails.

## Fix
Run a single migration to add both columns:

```sql
ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS billing_interval text,
  ADD COLUMN IF NOT EXISTS modal_premium numeric;
```

No code changes needed — `PostDealModal.tsx` already handles these fields correctly. The form will work once the columns exist.

## Files
- **Database migration only** — add `billing_interval` (text, nullable) and `modal_premium` (numeric, nullable) to `policies`

