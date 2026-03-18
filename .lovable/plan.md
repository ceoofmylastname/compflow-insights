

# Why "Post a Deal" fails

## Two issues found

### Issue 1: RLS blocks non-owner agents from inserting policies
The `policies` table only has an INSERT policy for owners (`is_owner = true`). Any regular agent trying to Post a Deal gets a silent RLS denial. Since Post a Deal is intended for all agents, we need an additional INSERT policy.

**Fix**: Add an RLS policy allowing any authenticated tenant member to insert policies where `resolved_agent_id` matches their own agent ID. This lets agents post their own deals without being able to insert policies attributed to other agents.

```sql
CREATE POLICY "Agents can insert own policies"
ON public.policies FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = get_current_agent_tenant_id()
  AND resolved_agent_id IN (
    SELECT id FROM public.agents WHERE auth_user_id = auth.uid()
  )
);
```

### Issue 2: The auto-claim RLS policy references `auth.users` causing 403 errors
The "Auto-claim agent record by email match" policy on the `agents` table does `SELECT email FROM auth.users WHERE id = auth.uid()`. RLS policies run as the calling role (anon/authenticated), which does NOT have SELECT permission on `auth.users`. This causes the `"permission denied for table users"` error on every login.

**Fix**: Replace the direct `auth.users` reference with `auth.jwt() ->> 'email'`, which reads from the JWT token and doesn't require table access.

```sql
DROP POLICY "Auto-claim agent record by email match" ON public.agents;
CREATE POLICY "Auto-claim agent record by email match"
ON public.agents FOR UPDATE TO authenticated
USING (auth_user_id IS NULL AND email = (auth.jwt() ->> 'email'))
WITH CHECK (auth_user_id = auth.uid());
```

## Files to change
- **Database migration only** — two new/updated RLS policies
- **No code changes needed**

## Result
- All agents can post deals attributed to themselves
- Owners can still post deals attributed to any agent (existing owner policy covers this)
- The 403 auto-claim errors on login stop occurring

