

# Why Writing Agent is Empty on Team Production

## Root Cause

The Writing Agent column looks up the agent name using `getAgentName(p.resolved_agent_id)`, which searches the list returned by `useAgents()`. However, the `agents` table SELECT RLS policy only returns agents who are in the current user's downline chain (via `upline_email`). It does **not** include an owner bypass.

So if the agent who posted the deal is not linked in the upline chain to the current user, their name can't be resolved — resulting in an empty/`--` Writing Agent cell, even though their policy is visible.

The `policies` SELECT policy correctly has an owner bypass, so owners see the policy. But the `agents` SELECT policy does not, so the agent's name can't be looked up.

## Fix

Add an owner bypass to the agents SELECT RLS policy so owners can see all agents in their tenant:

```sql
DROP POLICY "Agents can view themselves and downline" ON public.agents;

CREATE POLICY "Agents can view themselves and downline"
ON public.agents FOR SELECT TO authenticated
USING (
  tenant_id = get_current_agent_tenant_id()
  AND (
    auth_user_id = auth.uid()
    OR id IN (SELECT get_downline_agent_ids(get_current_agent_email()))
    OR EXISTS (
      SELECT 1 FROM public.agents
      WHERE auth_user_id = auth.uid() AND is_owner = true
    )
  )
);
```

This is a **database migration only** — no code changes needed. Once owners can see all tenant agents, the name lookup will work correctly.

