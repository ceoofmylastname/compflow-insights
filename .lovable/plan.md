

# Fix Build Error: Edge Function OpenAI Type Resolution

## Problem

The build error comes from the `jsr:@supabase/functions-js/edge-runtime.d.ts` import used in both edge functions. This JSR package internally references `npm:openai@^4.52.5` in its type definitions, and since there's no `deno.json` with dependency mappings, the type resolver fails.

## Additionally from network logs

There are two runtime issues visible:
1. **"infinite recursion detected in policy for relation agents"** — the RLS policy on `agents` table has a circular reference (likely an UPDATE policy that queries agents to check ownership).
2. **`resolve_tenant_by_domain` function missing** — 404 on RPC call.
3. **`manage-custom-domain` edge function failing** — "Failed to fetch" (likely the missing CF_ZONE_ID/CF_API_TOKEN secrets).

## Fix Plan

### 1. Remove the problematic JSR import from both edge functions
Replace `import "jsr:@supabase/functions-js/edge-runtime.d.ts";` with nothing (Deno runtime types are available automatically in Lovable Cloud edge functions). This fixes the build error.

**Files:**
- `supabase/functions/fire-webhook/index.ts` — remove line 1
- `supabase/functions/manage-custom-domain/index.ts` — remove line 1

### 2. Fix infinite recursion in agents RLS policy
Run a migration to drop and recreate the agents UPDATE policy so it doesn't recursively query the agents table. Use a `SECURITY DEFINER` helper function to check tenant ownership without triggering RLS.

### 3. Create missing `resolve_tenant_by_domain` function
Run a migration to create this database function that the `useTenantFromDomain` hook calls.

### 4. Note on manage-custom-domain failures
The edge function requires `CF_ZONE_ID` and `CF_API_TOKEN` secrets. These need to be configured for the domain feature to work. Will prompt for secrets if not already set.

