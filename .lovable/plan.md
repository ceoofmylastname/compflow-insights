

# Why carriers aren't showing for info@yenomai.com

## Root Cause

The `info@yenomai.com` agent record has `auth_user_id = NULL`. They exist in the agents table under the correct tenant (`JRM Enterprise Group`), but their agent record was never linked to their authentication account.

Every RLS policy in the system uses `get_current_agent_tenant_id()` which does:
```sql
SELECT tenant_id FROM agents WHERE auth_user_id = auth.uid()
```

Since `auth_user_id` is NULL for this agent, it returns NULL, and **all tenant-scoped queries return empty** -- carriers, policies, commission levels, everything.

## What happened

The agent was likely added to the roster manually by the owner, and then either:
- Signed up without using the invite link (so no linking occurred), or
- The invite acceptance flow didn't set `auth_user_id` on the agent record

## Fix

**Step 1: Immediately link the existing agent record**

Run a migration to link the agent to their auth account:
```sql
UPDATE public.agents
SET auth_user_id = (SELECT id FROM auth.users WHERE email = 'info@yenomai.com' LIMIT 1)
WHERE email = 'info@yenomai.com' AND tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND auth_user_id IS NULL;
```

**Step 2: Fix the signup flow to prevent this in the future**

Update the Signup page so that when a user signs up (even without an invite token), if an agent record already exists with their email and `auth_user_id IS NULL`, the system automatically claims it. Currently, claiming only happens when there's an invite token. The fix:

In `src/pages/Signup.tsx`, after successful signup, add a step that attempts to link any unclaimed agent record with matching email to the new `auth_user_id`. This mirrors what the invite flow does but works for direct signups too.

**Step 3: Add a safety net in the onboarding flow**

In `src/pages/Onboarding.tsx` (or wherever post-login routing happens), check if the logged-in user has an agent record with matching email but NULL `auth_user_id`, and auto-link it.

## Files to change
- Database migration: link info@yenomai.com's agent record now
- `src/pages/Signup.tsx`: auto-claim unclaimed agent records on signup
- Optionally add a `useEffect` in the auth hook or app layout to auto-link on login

## Expected result
After linking, info@yenomai.com will immediately see:
- Transamerica carrier in the dropdown
- All shared tenant data (commission levels, policies, etc.)
- Their correct position in the org hierarchy

