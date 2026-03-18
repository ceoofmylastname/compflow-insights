

# Fix: Missing `is_archived` Column + Performance Improvements

## Issue 1: "column agents.is_archived does not exist"

The `useAgents()` hook filters by `.neq("is_archived", true)` and `useArchivedAgents()` filters by `.eq("is_archived", true)`, but the `agents` table has no `is_archived`, `archived_at`, or `archived_by` columns.

**Fix:** Add a database migration to create these three columns on the `agents` table:
- `is_archived` (boolean, default false)
- `archived_at` (timestamptz, nullable)
- `archived_by` (uuid, nullable)

## Issue 2: Slow page loads

The sidebar (`AppSidebar`) fires 5 queries on every page load: `useCurrentAgent`, `useTenant`, `useCarriers`, `useAgentContracts`, `useDrafts`. Combined with each page's own queries, this creates a waterfall of requests.

**Fixes:**
1. **Lazy-load routes** -- Convert all page imports in `App.tsx` to `React.lazy()` with `Suspense`, so only the current page's code is loaded.
2. **Increase `staleTime`** on sidebar-related queries (`useCarriers`, `useDrafts`, `useAgentContracts`) so they don't refetch on every navigation. Set `staleTime: 2 * 60 * 1000` (2 minutes).
3. **Configure global QueryClient defaults** with `staleTime: 60_000` and `refetchOnWindowFocus: false` to reduce unnecessary refetches.

## Changes Summary

| Area | Change |
|------|--------|
| Database migration | Add `is_archived`, `archived_at`, `archived_by` to `agents` |
| `App.tsx` | Lazy-load all page components with `React.lazy` + `Suspense` |
| `App.tsx` | Set global QueryClient `staleTime` and `refetchOnWindowFocus: false` |
| `useCarriers.ts`, `useDrafts.ts`, `useAgentContracts.ts` | Add `staleTime: 2 * 60 * 1000` |

