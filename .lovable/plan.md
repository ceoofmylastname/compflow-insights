

# CompFlow — Full Dashboard Wiring Plan

## Current State
- Auth (signup/login/reset) is functional
- Database schema with 8 tables, RLS, and recursive downline function is deployed
- Only a placeholder Dashboard page exists — no sidebar, no data queries, no other pages
- No shared app layout or navigation shell

## Architecture Decisions

### Shared Layout
Create an `AppLayout` component with a collapsible sidebar (using the existing shadcn sidebar component) containing nav links to all pages. Header shows user email, sign out, and theme toggle. All authenticated pages render inside this layout.

### Data Fetching Pattern
Use `@tanstack/react-query` with custom hooks per entity. Each hook calls Supabase client directly. RLS handles scoping automatically — no need to manually filter by tenant or downline in most queries (the DB functions handle it).

### Helper Hooks
- `useCurrentAgent()` — fetches the logged-in user's agent record (needed for tenant_id, position, email, annual_goal, is_owner)
- `useAgents()` — fetches visible agents (RLS-scoped)
- `usePolicies(filters)` — fetches policies with optional filters
- `useCommissionPayouts(filters)` — fetches payouts
- `useCommissionLevels()` — fetches rate schedules
- `useCommissionRate(carrier, position, applicationDate)` — looks up the applicable rate

### Commission Rate Calculation
Client-side lookup: query `commission_levels` where carrier/position match and `start_date <= application_date`, order by `start_date DESC`, take first. This avoids needing a new DB function since the data is already accessible via RLS.

---

## Implementation Phases (7 phases, ordered by dependency)

### Phase 1: App Shell & Shared Infrastructure
**Files:** `AppLayout.tsx`, `Sidebar.tsx`, hooks (`useCurrentAgent`, `useAgents`, `usePolicies`, `useCommissionLevels`, `useCommissionPayouts`), utility formatters (`formatCurrency`, `formatPercent`, `formatDate`), `EmptyState` component, `StatusBadge` component, `DataTable` wrapper with sorting/pagination/export.

- Sidebar nav: Dashboard, My Production, Team Production, Book of Business, Scoreboard, Agent Roster, Commission Levels, Settings
- Mobile: sidebar collapses to hamburger
- Add all routes to App.tsx

### Phase 2: Dashboard Page (`/dashboard`)
**Queries:**
1. Total Active Annual Premium — `policies` where `status = 'Active'`, sum `annual_premium`
2. Commission Earned YTD — `commission_payouts` where `calculated_at >= Jan 1 current year`, sum `commission_amount`
3. Policies This Month — `policies` where `application_date` in current month, count
4. Team Size — `agents` count minus 1 (self)

**Components:** 4 stat cards, annual goal progress bar (from `useCurrentAgent`), recent policies table (last 10), quick action buttons (Import CSV, Invite Agent — open modals).

### Phase 3: CSV Import Modal (global)
Three-tab modal: Agent Roster | Commission Levels | Policy Report

Each tab: file upload → CSV parse (use `FileReader` + manual CSV parsing or a small utility) → preview 5 rows → field mapping dropdowns (auto-map on name match) → validation with error report → confirm import → progress → toast.

**Agent Roster Import:** Required fields mapped, upsert on email conflict, set `auth_user_id = null` for new agents.

**Commission Levels Import:** Rate conversion (strip %, divide by 100), all rows insert as new.

**Policy Report Import:** NPN resolution (`writing_agent_id` → `agents.npn` → `resolved_agent_id`), status normalization, premium cleaning, policy_number upsert, commission calculation after import (lookup rate from `commission_levels`), upsert `commission_payouts`. Client name fuzzy matching UI for conflicts.

**Webhook trigger:** After importing policies that are Active, POST to `webhook_configs.webhook_url` if active. This will be done via an edge function `fire-webhook` to avoid CORS issues from the browser.

### Phase 4: Production Pages
**My Production (`/my-production`):**
- Query policies where `resolved_agent_id = current agent id`
- For each row, compute commission rate client-side from `commission_levels`
- Filters: date range, carrier dropdown, status multi-select, contract type toggle
- Sortable columns, 25/page pagination, CSV export
- Summary row: total premium + total commission for filtered set

**Team Production (`/team-production`):**
- Same structure but scoped to downline only (exclude self)
- Additional column: Writing Agent name
- Rate lookup uses each policy's resolved agent's position
- Extra filter: Agent dropdown
- Toggle: Individual View vs Grouped by Agent (with subtotals)

### Phase 5: Book of Business & Scoreboard
**Book of Business (`/book-of-business`):**
- All policies (downline + self), one row per policy
- Live search on client_name (debounced 300ms)
- Filters: status, carrier, writing agent, date range
- Sortable, paginated, exportable

**Scoreboard (`/scoreboard`):**
- For each agent (downline + self), calculate: active policy count, total active premium, commission earned within time range
- Sort by premium desc, rank column
- Top 3 highlighted (gold/silver/bronze border)
- Logged-in agent pinned at bottom with blue highlight
- Time range toggle: This Month / This Quarter / YTD / Custom

### Phase 6: Agent Roster & Commission Levels
**Agent Roster (`/agent-roster`):**
- Table View: downline agents with search, position/contract type filters, 3-dot menu (View Profile side panel, Remove for owners)
- Org Chart View: recursive tree rendering with logged-in agent as root. Each node shows initials, name, position. Click opens side panel with stats. Scrollable/zoomable container.
- Invite Agent Modal: email, position, contract type, annual goal → insert to `invites` with generated token, `invitee_upline_email = current agent email`

**Commission Levels (`/commission-levels`):**
- All rates for tenant (read-only for non-owners)
- Rate displayed as "127.00%"
- Owner actions: Add Rate (inline row), Edit (inline), Delete (confirm), Import CSV button
- Non-owners: no edit controls

### Phase 7: Settings & Global Polish
**Settings (`/settings`):** 4 tabs
- Profile: edit first/last name, NPN, annual goal. Email + position + contract type read-only.
- Agency (owner only): edit agency name
- Notifications: webhook toggle, URL field, test button (calls edge function), save
- Danger Zone (owner only): Delete All Policies (type confirmation), Delete Account (type confirmation, deletes all data, signs out)

**Global Polish:**
- Empty states on every table page (CF logo + description + CTA)
- Skeleton loaders (shimmer rows) while loading
- Error banners with retry button on query failure
- Toast for every mutation (bottom-right, 4s auto-dismiss)
- Number formatting: `$1,234.56`, `127.00%`, `Jan 15, 2026`
- Mobile: horizontal table scroll, hamburger sidebar
- Modals: Escape to close, focus trap

### Database Migration Needed
- Create edge function `fire-webhook` for webhook POST (avoids browser CORS)
- Add RLS policy on `invites` for UPDATE (to mark as accepted) — currently missing
- Add RLS policy on `commission_payouts` for UPDATE/DELETE by owners (for recalculation on re-import)

### Edge Function: `fire-webhook`
Accepts `{ webhook_url, payload }`, POSTs to the URL, returns status. Called from client after policy import when status is Active.

---

## File Structure (new files)

```text
src/
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx
│   │   ├── AppSidebar.tsx
│   │   └── MobileHeader.tsx
│   ├── dashboard/
│   │   ├── StatCard.tsx
│   │   ├── GoalProgress.tsx
│   │   └── RecentPolicies.tsx
│   ├── shared/
│   │   ├── DataTable.tsx
│   │   ├── EmptyState.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── SkeletonTable.tsx
│   │   ├── ErrorBanner.tsx
│   │   └── CSVImportModal.tsx
│   ├── agents/
│   │   ├── AgentTable.tsx
│   │   ├── OrgChart.tsx
│   │   ├── AgentProfilePanel.tsx
│   │   └── InviteAgentModal.tsx
│   ├── production/
│   │   └── ProductionTable.tsx
│   ├── scoreboard/
│   │   └── ScoreboardTable.tsx
│   ├── commission-levels/
│   │   └── CommissionLevelsTable.tsx
│   └── settings/
│       ├── ProfileTab.tsx
│       ├── AgencyTab.tsx
│       ├── NotificationsTab.tsx
│       └── DangerZoneTab.tsx
├── hooks/
│   ├── useCurrentAgent.ts
│   ├── useAgents.ts
│   ├── usePolicies.ts
│   ├── useCommissionLevels.ts
│   ├── useCommissionPayouts.ts
│   └── useCommissionRate.ts
├── lib/
│   ├── formatters.ts
│   └── csv-utils.ts
├── pages/
│   ├── MyProduction.tsx
│   ├── TeamProduction.tsx
│   ├── BookOfBusiness.tsx
│   ├── Scoreboard.tsx
│   ├── AgentRoster.tsx
│   ├── CommissionLevels.tsx
│   └── Settings.tsx
supabase/
└── functions/
    └── fire-webhook/
        └── index.ts
```

This will be implemented in the order listed above, starting with Phase 1 (shell + hooks) since everything depends on it.

