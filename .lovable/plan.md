

# Add Delete Agent Functionality for Owners and Managers

## Current State
The Agent Roster already has an "Archive" action in the dropdown menu for owners. We need to add a "Delete" option that permanently removes an agent record.

## Database
The `agents` table already has an RLS policy "Owners can delete agents" allowing owners to delete. No schema changes needed -- just need to verify managers can also delete. Currently there's no manager-level delete policy, so we need to add one.

**Migration:** Add an RLS policy allowing managers (agents with a manager-like role) to delete agents in their tenant. However, looking at the current architecture, there's no `is_manager` flag on agents. The role hierarchy mentions "Manager" but checking `usePositions` and the agents table, position is a text field. We should use the `user_roles` table with `has_role()` function to check for manager access.

**New RLS policy:**
```sql
CREATE POLICY "Managers can delete agents"
ON public.agents FOR DELETE TO authenticated
USING (
  tenant_id = get_agent_tenant_id_secure(auth.uid())
  AND has_role(auth.uid(), 'moderator')
);
```

Note: The `app_role` enum has `admin`, `moderator`, `user`. We'll map "manager" to `moderator`.

## Code Changes

### 1. `src/hooks/useAgents.ts`
Add a `useDeleteAgent` mutation that calls `supabase.from("agents").delete().eq("id", agentId)`. Invalidate agent queries on success.

### 2. `src/pages/AgentRoster.tsx`
- Import `useDeleteAgent`
- Update `isOwner` check to also check for manager role (or just allow the delete action and let RLS enforce)
- Add a "Delete" dropdown menu item with a confirmation dialog, using `Trash2` icon
- Show delete option for both owners and managers

### 3. Permission check
- Add a simple `isManager` check alongside `isOwner` by querying user_roles, or simply show the delete button and let the backend RLS handle authorization (simpler approach)
- Since the archive button already shows for owners, we'll add delete for owners too and let RLS handle manager access

## Summary
| Area | Change |
|------|--------|
| Migration | Add "Managers can delete agents" RLS policy |
| `useAgents.ts` | Add `useDeleteAgent` mutation hook |
| `AgentRoster.tsx` | Add "Delete" option to agent row dropdown menu with confirmation |

