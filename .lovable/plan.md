

# Fix Account + Build Errors + Missing DB Columns

There are multiple interconnected issues to fix:

## Problem Summary

1. **jrmenterprisegroup@gmail.com has no tenant or agent record** — the signup flow failed silently, leaving the auth user stranded with no data access.

2. **The database is missing columns and functions that the code/types expect**, causing repeated 400 errors:
   - `policies` table is missing: `chargeback_risk`, `client_dob`, `client_phone`, `custom_fields`, `effective_date`, `lead_source`, `notes`, `refs_collected`, `refs_sold`
   - `agents` table is missing: `last_login_at`
   - `tenants` table is missing: `agency_name`, `logo_url`, `primary_color`
   - DB function `flag_chargeback_risk` doesn't exist

3. **5 build errors** in the code that need fixing.

## Plan

### Step 1: Database migration — add all missing columns and functions

Single migration to add:
- `agents.last_login_at` (timestamptz, nullable)
- `tenants.agency_name` (text, nullable), `tenants.logo_url` (text, nullable), `tenants.primary_color` (text, nullable)
- `policies.chargeback_risk` (boolean, default false), `policies.client_dob` (text, nullable), `policies.client_phone` (text, nullable), `policies.custom_fields` (jsonb, default '{}'), `policies.effective_date` (date, nullable), `policies.lead_source` (text, nullable), `policies.notes` (text, nullable), `policies.refs_collected` (integer, default 0), `policies.refs_sold` (integer, default 0)
- Create `flag_chargeback_risk()` function that marks policies as at risk when Pending for 30+ days

### Step 2: Create tenant + owner agent record for jrmenterprisegroup@gmail.com

Data insert (using insert tool):
- Create tenant with `name: 'JRM Enterprise Group'`
- Create agent with `auth_user_id: '45e8eeb5-276a-432e-a4de-6cf80f5c33a0'`, `email: 'jrmenterprisegroup@gmail.com'`, `is_owner: true`, linked to the new tenant

### Step 3: Fix 5 build errors

1. **RecentPolicies.tsx** — `usePolicies({ limit: 5 })` returns `Policy[] | PaginatedPolicies`. Since `limit` (not `page`) is used, the result is `Policy[]`, but TypeScript can't narrow it. Fix: import `getPoliciesArray` and use it to extract the array.

2. **PolicyImportWizard.tsx line 504** — `premium` is undefined, should be `rawPremium` or `premiumToUpsert`.

3. **useCarrierProfiles.ts line 20** — `Json` type doesn't overlap with `CarrierProfile[]`. Fix: cast through `unknown` first: `as unknown as CarrierProfile[]`.

4. **BookOfBusiness.tsx line 161** — Lucide `AlertTriangle` doesn't accept `title` prop. Use a wrapping `<span title="...">` instead.

### Regarding role hierarchy

The user mentioned Owner / Manager / Agent / Admin Owner roles. The current `app_role` enum only has `admin`, `moderator`, `user`. The existing system uses `is_owner` on the agents table for owner logic. A full role hierarchy redesign is a larger feature — for now, I'll ensure jrmenterprisegroup@gmail.com is set up as the owner with full access, which gives them complete control over their tenant. The role hierarchy expansion can be planned as a follow-up.

### Files changed
- **Migration SQL**: Add missing columns, functions
- **Data insert**: Create tenant + agent for the user
- `src/components/dashboard/RecentPolicies.tsx` — use `getPoliciesArray`
- `src/components/import/PolicyImportWizard.tsx` — fix `premium` → `premiumToUpsert`
- `src/hooks/useCarrierProfiles.ts` — double-cast through `unknown`
- `src/pages/BookOfBusiness.tsx` — wrap AlertTriangle in span for title
- `src/hooks/useAlerts.ts` — will work once `chargeback_risk` column exists (no code change needed)
- `src/hooks/use-auth.tsx` — `last_login_at` update will work once column exists (no code change needed)

