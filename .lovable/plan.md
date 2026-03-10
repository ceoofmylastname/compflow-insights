

# End-to-End Flow Audit Results

## Critical Issues Found

### Issue 1: Email Confirmation Blocks Signup Flow
The project does **not** have auto-confirm enabled for email signups. When a new user signs up:
1. `supabase.auth.signUp()` returns a user object but **no session** (email unconfirmed)
2. The code immediately tries to INSERT into `tenants` and `agents` tables
3. These tables have RLS policies requiring `auth.uid()` — but without a session, `auth.uid()` is null
4. **Result: tenant and agent creation will fail with RLS violation**

**Fix needed:** Either enable auto-confirm for email signups, or restructure the signup flow to defer tenant/agent creation until after email confirmation.

### Issue 2: Global UNIQUE Constraint on `agents.email`
The first migration creates `email TEXT NOT NULL UNIQUE` (global unique across all tenants), AND the third migration adds `UNIQUE (email, tenant_id)`. The global unique means:
- Two tenants cannot have agents with the same email
- The CSV upsert uses `onConflict: "email,tenant_id"` but may hit the stricter global constraint first

This isn't blocking for single-tenant testing, but is a design flaw for multi-tenancy.

### Issue 3: Second Agent Login Has No Path
Agents imported via CSV have no `auth_user_id`. For a second agent to log in and see their data:
- They need to sign up via the invite flow
- The invite flow must link their `auth_user_id` to the existing agent record
- Currently the signup page always creates a **new** agent — there's no path to claim an existing agent record via invite token

---

## Step-by-Step Verification

### Step 1: New user signs up → creates tenant → lands on onboarding
**WILL FAIL** — blocked by Issue 1 (no session before email confirmation). The `INSERT` into `tenants` will be rejected by RLS.

**Plan:** Enable auto-confirm for email signups using the auth configuration tool, so users get a session immediately.

### Step 2: Owner imports Agent Roster CSV (2 agents with upline relationship)
**WILL WORK** (after Step 1 is fixed) — the upsert logic, field mapping, and `onConflict: "email,tenant_id"` constraint all exist. One concern: the `agents` table has `is_owner: false` hardcoded in the import, which is correct for downline agents.

### Step 3: Owner imports Commission Levels CSV
**WILL WORK** — straightforward insert into `commission_levels` with tenant scoping. RLS allows owner inserts.

### Step 4: Owner imports Policy Report CSV (writing_agent_id matches NPN)
**WILL WORK** — the resolution logic checks `carrier_agent_aliases` first, then falls back to NPN match against `agents.npn`. Commission payouts are auto-calculated if a matching rate exists.

### Step 5: Dashboard loads and shows stats
**WILL WORK** — queries are well-structured: total active premium, YTD commission, policies this month, team size, goal progress. All scoped via RLS.

### Step 6: Second agent logs in and sees only their data + downline
**WILL FAIL** — blocked by Issue 3. No mechanism to link a new auth signup to an existing CSV-imported agent record. The invite accept flow needs to be verified/built.

### Step 7: fire-webhook edge function fires on active policy
**WILL WORK** — the webhook fires during policy import when `status === "Active"` and a `webhook_config` exists for the tenant. The edge function is deployed and handles the POST correctly.

---

## Implementation Plan

### Phase 1: Enable auto-confirm (fixes Steps 1, 2, 3, 4, 5)
- Use `configure_auth` tool to enable auto-confirm for email signups
- This gives users an immediate session after signup

### Phase 2: Fix invite/claim agent flow (fixes Step 6)
- When a user signs up via an invite token URL, instead of creating a new agent, find the existing agent by `invitee_email` and set `auth_user_id` to the new user's ID
- Add a route like `/signup?invite=TOKEN` that triggers this alternate flow
- Update the agents UPDATE RLS to allow setting `auth_user_id` on the matching agent record

### Phase 3: Drop global UNIQUE on `agents.email` (design fix)
- Create a migration: `ALTER TABLE public.agents DROP CONSTRAINT agents_email_key;`
- The composite `UNIQUE (email, tenant_id)` is sufficient for multi-tenancy

