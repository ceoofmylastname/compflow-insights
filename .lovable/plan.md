Apply the orphan auto-link migration as a single SQL migration:

1. Add `policies.agent_number TEXT` column (idempotent).
2. Backfill `agent_number` on existing policies by joining `agent_contracts` on (tenant_id, carrier, agent_id).
3. Create partial index `idx_policies_orphan_lookup` on (tenant_id, carrier, agent_number) WHERE resolved_agent_id IS NULL.
4. Create `public.auto_link_orphan_policies()` SECURITY DEFINER trigger function that, on agent_contracts insert/update of agent_number, writes a `contract_added_backfill` row into `policy_status_history` for each matching orphan and then sets `resolved_agent_id` on those policies.
5. Recreate `agent_contracts_auto_link` AFTER INSERT OR UPDATE OF agent_number trigger.
6. Add `public.policies` to the `supabase_realtime` publication if missing, and set REPLICA IDENTITY FULL so realtime updates carry full row data for the orphan-attach UI.

After it applies, run the verification query and report the four booleans (`has_agent_number_column`, `has_orphan_index`, `has_trigger`, `in_publication`) — expected all true.

No frontend code changes. No edits to `client.ts`, `types.ts`, or `config.toml`.