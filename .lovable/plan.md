

# Add `carrier_agent_aliases` Table & Update Policy Import Resolution

## Phase 1: Database Migration

Create a migration with the provided SQL to add the `carrier_agent_aliases` table with:
- Foreign keys to `tenants` and `agents` (cascade delete)
- Unique constraint on `(tenant_id, carrier, writing_agent_id)`
- RLS enabled with two policies: tenant-scoped SELECT, owner-scoped ALL

One adjustment needed: the `FOR ALL` policy requires separate `USING` and `WITH CHECK` expressions — the `AND EXISTS(...)` needs to be inside both, not concatenated in `USING` alone.

## Phase 2: Update CSVImportModal.tsx

### Validation step (`handleValidate`)
- For policy rows, after building the record, attempt agent resolution:
  1. Query `carrier_agent_aliases` where `carrier` + `writing_agent_id` match → get `agent_id`
  2. If no alias match, fall back to `agents.npn` match (current logic)
  3. If neither matches, mark the row as "unresolved" instead of an error — add it to a new `unresolvedRows` state array with the row data and reason
- Unresolved rows are shown in validation preview with a warning (yellow), distinct from hard errors (red)
- User can still proceed with import but unresolved rows will have `resolved_agent_id = null`

### Validation UI
- Add a third section in the validate step showing unresolved agent rows (amber/warning color)
- Display: row number, writing_agent_id value, carrier, and "No matching agent found"

### Import step (`handleImport`)
- Before NPN lookup, query `carrier_agent_aliases` first:
  ```ts
  const { data: alias } = await supabase
    .from("carrier_agent_aliases")
    .select("agent_id")
    .eq("carrier", r.carrier)
    .eq("writing_agent_id", r.writing_agent_id)
    .maybeSingle();
  if (alias) resolvedAgentId = alias.agent_id;
  else { /* existing NPN fallback */ }
  ```

### New state
- `unresolvedRows: { row: number; writing_agent_id: string; carrier: string }[]`

### Note on types
- The `carrier_agent_aliases` table won't be in the generated types until after migration runs. We'll use `.from("carrier_agent_aliases" as any)` temporarily or the types will auto-regenerate after migration.

