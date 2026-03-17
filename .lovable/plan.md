

# Fix: Infinite Recursion on `agents` Table

## Problem

The `PATCH /agents` call to update `last_login_at` returns a 500 error: **"infinite recursion detected in policy for relation agents"**.

The recursion chain:
1. UPDATE on `agents` triggers the **"Invited agents can claim their record"** policy
2. That policy has `EXISTS (SELECT 1 FROM invites WHERE ...)`
3. The `invites` table policies (**"Owners can view invites"**, **"Invitees can accept invites"**, **"Owners can create invites"**, **"Owners can delete invites"**) query back into `agents` directly (not using SECURITY DEFINER functions)
4. This creates `agents → invites → agents` recursion

## Fix

A single database migration that replaces the `invites` policies that query `agents` directly with versions using the existing SECURITY DEFINER helper functions (`get_current_agent_tenant_id()`, `is_tenant_owner()`, `get_current_agent_email()`).

### Policies to drop and recreate on `invites`:

| Policy | Current (broken) | Fixed |
|--------|-----------------|-------|
| Owners can view invites | `EXISTS (SELECT 1 FROM agents WHERE ...)` | `is_tenant_owner(auth.uid())` |
| Owners can create invites | `EXISTS (SELECT 1 FROM agents WHERE ...)` | `is_tenant_owner(auth.uid())` |
| Owners can delete invites | `SELECT agents.tenant_id FROM agents...` + `EXISTS` | `get_current_agent_tenant_id()` + `is_tenant_owner(auth.uid())` |
| Invitees can accept invites | `SELECT agents.email FROM agents...` | `get_current_agent_email()` |

All 4 policies will be dropped and recreated using the SECURITY DEFINER functions, breaking the recursion cycle. No application code changes needed.

