

# Agent Contracts Visibility Issue

## Problem
The `agent_contracts` table SELECT RLS policy is `tenant_id = get_current_agent_tenant_id()` — meaning every agent in the tenant can see **all** contracts, including their upline's writing numbers. From the screenshot, Johnae Melvin (a non-owner agent) can see contracts with agent "--" (the owner) and their own.

Agents should only see:
1. Their own contracts
2. Their downline's contracts
3. Owners see everything (existing pattern)

## Fix — Database Migration Only

Update the SELECT policy on `agent_contracts` to mirror the same visibility pattern used on `policies` and `agents`:

```sql
DROP POLICY "Tenant members can view agent contracts" ON public.agent_contracts;

CREATE POLICY "Agents can view own and downline contracts"
ON public.agent_contracts FOR SELECT TO authenticated
USING (
  tenant_id = get_current_agent_tenant_id()
  AND (
    agent_id IN (SELECT id FROM public.agents WHERE auth_user_id = auth.uid())
    OR agent_id IN (SELECT get_downline_agent_ids(get_current_agent_email()))
    OR is_tenant_owner(auth.uid())
  )
);
```

No code changes needed — the Contracts page and hook already query `agent_contracts` and resolve names via `useAgents()`, which already has the correct visibility rules.

## Files Changed
- New database migration (SQL only)

