

# Super Admin Dashboard

## Overview
Build a platform-level admin dashboard for `jrmenterprisegroup@gmail.com` that shows all tenants across the BaseshopHQ SaaS platform. This is separate from the regular owner dashboard and requires cross-tenant data access via a backend function.

## 1. Database Migration

Create `platform_admins` table with RLS. Seed the super admin record.

```sql
CREATE TABLE public.platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin can view platform admins"
  ON public.platform_admins FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());
```

Seed must happen via a separate data insert (not migration) since it references `auth.users`.

## 2. Edge Function: `get-platform-data`

Config: `verify_jwt = false` in `config.toml`. Validates caller is in `platform_admins` table using `getClaims()`.

Uses service role key to query across all tenants:
- All tenants with their details
- For each tenant: owner agent info, total agent count, active agents (with policies in last 30 days), total policies, total premium
- Returns a flat array of tenant summary objects

Also supports a `tenantId` param for detail drill-down (agents, policies, commission levels, carriers, webhooks for a single tenant).

## 3. New Files

| File | Purpose |
|------|---------|
| `src/hooks/useSuperAdmin.ts` | Query `platform_admins` to check if current user is super admin |
| `src/hooks/usePlatformData.ts` | Call edge function for tenant list and tenant details |
| `src/pages/SuperAdmin.tsx` | Main dashboard with stat cards, filters, expandable tenant table |
| `src/pages/SuperAdminTenantDetail.tsx` | Read-only detail view for a single tenant |
| `supabase/functions/get-platform-data/index.ts` | Service-role edge function for cross-tenant queries |

## 4. Super Admin Dashboard Page (`/super-admin`)

- Access gate: redirect to `/dashboard` if not super admin
- **4 stat cards**: Total Tenants, Active Subscriptions, Total Agents, Total Premium
- **Filter bar**: search (agency/owner name/email), plan filter, status filter, date range
- **Tenant table**: Agency Name, Owner, Email, Plan badge, Status badge, Agents, Active (30d), Policies, Premium, Signed Up, Actions
- **Expandable rows**: click to show org hierarchy tree (reuse `OrgTree` pattern), subscription details, last import, webhooks, domain info
- **Row styling**: yellow highlight for expiring trials, gray for expired/cancelled, green left border for new this week

## 5. Tenant Detail Page (`/super-admin/tenant/:tenantId`)

Read-only view with tabs:
- Agents table (name, position, email, upline, contract type, last login, monthly policies)
- Policies table (policy number, carrier, product, agent, premium, status, date)
- Commission levels, carriers, webhooks, subscription info

## 6. Sidebar Update (`AppSidebar.tsx`)

- Import `useSuperAdmin` hook
- If super admin, render a "PLATFORM ADMIN" nav section at the top with "All Accounts" link + tenant count badge
- Add "Platform Admin" text badge next to user name in sidebar footer

## 7. Routes (`App.tsx`)

Add two protected routes:
```tsx
<Route path="/super-admin" element={<ProtectedRoute><SuperAdmin /></ProtectedRoute>} />
<Route path="/super-admin/tenant/:tenantId" element={<ProtectedRoute><SuperAdminTenantDetail /></ProtectedRoute>} />
```

## 8. Implementation Order

1. Database migration (create `platform_admins` table)
2. Seed super admin record via insert
3. Edge function `get-platform-data`
4. `useSuperAdmin.ts` hook
5. `usePlatformData.ts` hook
6. `SuperAdmin.tsx` page
7. `SuperAdminTenantDetail.tsx` page
8. Update `AppSidebar.tsx` with platform admin section
9. Update `App.tsx` with routes

