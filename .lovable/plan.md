## Apply BoB bulk delete migration

Run the provided SQL as a single migration. It is purely additive (new table + new RPC) and matches the existing `useBulkDeletePolicies` hook and `BulkDeletePoliciesModal` already in the codebase, which call `bulk_delete_policies` and read `policy_deletions_audit.reason`.

### What the migration does

1. **Create `public.policy_deletions_audit`** — forensic trail of every deleted policy (tenant_id, policy snapshot fields, paid commission total at deletion, deleted_by, reason).
   - Two indexes: `(tenant_id, deleted_at DESC)` and `(policy_id)`.
   - RLS enabled. SELECT policy: only owners of the same tenant can read their tenant's audit rows. No INSERT/UPDATE/DELETE policies — writes happen through the SECURITY DEFINER RPC only.

2. **Create `public.bulk_delete_policies(uuid[], text)` RPC** — SECURITY DEFINER, `SET search_path = public`.
   - Asserts `auth.uid()` is set.
   - Resolves caller's agent row, requires `is_owner = true`.
   - Rejects cross-tenant policy ids.
   - Snapshots each target policy into `policy_deletions_audit` (joining `commission_payouts` for paid totals).
   - Deletes from `commission_payouts`, `policy_status_history`, then `policies` (scoped to caller's tenant).
   - Returns one row per deleted policy with the audit id.
   - `REVOKE ALL FROM PUBLIC` then `GRANT EXECUTE TO authenticated`.

### After it applies

Run the verification query:

```sql
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
            WHERE table_schema='public' AND table_name='policy_deletions_audit') AS has_audit_table,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
            WHERE n.nspname='public' AND p.proname='bulk_delete_policies') AS has_rpc;
```

Report both booleans back. Expected: `has_audit_table = true`, `has_rpc = true`.

### No code changes

`src/hooks/useBulkDeletePolicies.ts` and `src/components/policies/BulkDeletePoliciesModal.tsx` are already wired to this RPC and audit table. No frontend edits needed.

### Notes / linter expectations

The Supabase linter may flag `policy_deletions_audit` for "no INSERT policy" — this is intentional. All inserts go through the SECURITY DEFINER RPC; direct client inserts must be blocked.
