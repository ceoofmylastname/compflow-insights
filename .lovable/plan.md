## Apply agent_contracts self-service RLS migration

Run the provided SQL as a single migration. It replaces the agent_contracts policies so agents can manage their own writing numbers from Settings → My Writing Numbers, while owners and managers retain full team-wide access.

### What the migration does

1. **Create `public.current_agent_id()`** — SECURITY DEFINER helper returning the caller's `agents.id`.
2. **Create `public.is_owner_or_manager()`** — SECURITY DEFINER helper returning true if caller is an owner OR has at least one downline agent (matches the runtime "Manager" label in `src/lib/agent-role.ts`).
3. **Drop all existing `agent_contracts` policies** (both legacy names and new names, idempotent via `IF EXISTS`).
4. **Recreate four policies**:
   - `agent_contracts_select` — self, downline, or owner/manager (tenant-scoped)
   - `agent_contracts_insert` — self or owner/manager
   - `agent_contracts_update` — self or owner/manager (USING + WITH CHECK)
   - `agent_contracts_delete` — owner/manager only

### After it applies

Run the verification query:

```sql
SELECT polname, polcmd
  FROM pg_policy
 WHERE polrelid = 'public.agent_contracts'::regclass
 ORDER BY polname;
```

Report all rows back. Expected: exactly 4 rows — `agent_contracts_delete` (d), `agent_contracts_insert` (a), `agent_contracts_select` (r), `agent_contracts_update` (w).

### No frontend code changes

`useAgentContracts.ts` already uses standard `.insert()` / `.delete()` against `agent_contracts` and will start working for non-owner agents on their own rows once the policies land. No edits to hooks, components, or types are required.

### Notes

- The new `is_owner_or_manager()` helper is a small generalization of `is_tenant_owner()` and may be reused later for other tables that need manager-level write access.
- Linter should stay clean; all four CRUD operations are covered by policies.
