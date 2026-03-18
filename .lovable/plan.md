

# Role-Based Invite Permissions

## Problem
Currently only owners can invite agents (the `invites` INSERT RLS policy requires `is_tenant_owner`). The position dropdown always shows "Manager" and "Agent" regardless of who is inviting. The user wants:
- **Agents** can invite, but can only assign position "Agent" (not Manager)
- **Managers** can invite and assign "Manager" or "Agent"
- **Owners** can invite and assign "Manager" or "Agent"

## Changes

### 1. Database Migration — Allow managers and agents to create invites
Update the INSERT policy on `invites` to allow any authenticated tenant member to insert:

```sql
DROP POLICY "Owners can create invites" ON public.invites;

CREATE POLICY "Tenant members can create invites"
ON public.invites FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = get_current_agent_tenant_id()
);
```

Also need to update the agents INSERT policy so non-owners can pre-create placeholder agent records for their invitees:

```sql
CREATE POLICY "Agents can insert invited agents"
ON public.agents FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = get_current_agent_tenant_id()
  AND is_owner = false
  AND auth_user_id IS NULL
);
```

### 2. Update `InviteAgentModal.tsx` — Role-based position options
- Determine the inviter's role: owner (`currentAgent.is_owner`), manager (has downline agents via `useAgents`), or agent
- If the inviter is an **agent** (not owner, not manager): only show "Agent" in the position dropdown
- If the inviter is an **owner or manager**: show both "Manager" and "Agent"
- No other code changes needed — the modal already sets `upline_email` to `currentAgent.email`

## Files Changed
- New database migration (2 policy updates)
- `src/components/agents/InviteAgentModal.tsx` — conditional position options based on inviter role

