

# Agent Can't Update Settings — Root Cause & Fix

## Problem Identified

The agent `support@automateai.us` (Bryson Melvin) has `auth_user_id = NULL` in the database. This means:

1. **Profile save fails** — The "Agents can update own record" RLS policy requires `auth_user_id = auth.uid()`. Since `auth_user_id` is NULL, the update is blocked silently.
2. **Email, Position, Contract Type empty/uneditable** — `useCurrentAgent` queries `agents WHERE auth_user_id = auth.uid()`, which returns nothing since the link is missing. The form shows empty data. Position ("Agent") and Contract Type ("Direct Pay") ARE set in the DB but the query returns no record.

**Root cause:** During invite signup, `supabase.auth.signUp()` does not create a session when email confirmation is required. The subsequent agent record update (to set `auth_user_id`) runs without a valid JWT, so RLS blocks it silently. The auto-claim in `use-auth.tsx` also fails for the same reason on first login.

## Fix — 3 Parts

### 1. Database: Create a `claim_agent_record` security definer function
A function that bypasses RLS to link an agent record to an auth user, callable right after signup:

```sql
CREATE OR REPLACE FUNCTION public.claim_agent_record(
  p_agent_email TEXT,
  p_user_id UUID,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_npn TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agents
  SET auth_user_id = p_user_id,
      first_name = COALESCE(NULLIF(p_first_name, ''), first_name),
      last_name = COALESCE(NULLIF(p_last_name, ''), last_name),
      npn = COALESCE(NULLIF(p_npn, ''), npn),
      phone = COALESCE(NULLIF(p_phone, ''), phone)
  WHERE email = p_agent_email
    AND auth_user_id IS NULL;
END;
$$;
```

### 2. Fix existing data for `support@automateai.us`
In the same migration, link the existing agent record:

```sql
UPDATE public.agents
SET auth_user_id = '6a23c6ef-70fe-482f-802d-004abe2d2d5c'
WHERE email = 'support@automateai.us'
  AND auth_user_id IS NULL;
```

### 3. Update `src/pages/Signup.tsx`
Replace the direct `.update()` calls for claiming agent records with `supabase.rpc('claim_agent_record', { ... })`. This works even without a session because the function is `SECURITY DEFINER`.

Three locations to update:
- **Invite flow** (line ~87): Replace `.update()` with `.rpc('claim_agent_record', ...)`
- **Unclaimed agent flow** (line ~127): Same replacement
- **Auto-claim in `use-auth.tsx`** (line ~38): Replace with `.rpc('claim_agent_record', ...)` as a safety net

## Files Changed
- New database migration (function + data fix)
- `src/pages/Signup.tsx` — use `rpc('claim_agent_record')` instead of direct update
- `src/hooks/use-auth.tsx` — use `rpc('claim_agent_record')` for auto-claim on login

