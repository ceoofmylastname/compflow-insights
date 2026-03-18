

# Redesign Active Agents → All Agents with Status Badges

## Overview
Replace the current "Active Agents" page (which only shows agents with recent policies) with a modernized view that shows **all agents** with color-coded status badges indicating their activity level.

## Agent Status Categories & Badges

```text
Status              Color           Condition
─────────────────────────────────────────────────────────
Hot Streak          emerald/green   Wrote policy in last 7 days
Active              sky/blue        Wrote policy in last 30 days
Idle                amber/yellow    Has written before, but not in 30+ days
Dormant             red             Never wrote a policy
Inactive Login      purple          Hasn't logged in for 30+ days
Not Onboarded       slate/gray      auth_user_id is NULL (never signed up)
```

An agent can have **multiple badges** (e.g. "Idle" + "Inactive Login").

## UI Design
- Keep the page at `/active-agents` route, rename title to "Agent Activity"
- Add summary stat cards at top showing count per status category (pill-style, clickable to filter)
- Table shows ALL agents (not just active ones) with a new "Status" column showing badges
- Badges use the same `StatusBadge`-style design: rounded-full, dot indicator, semibold text, subtle border
- Add a status filter dropdown to filter by badge type
- Keep existing columns (Name, Email, Position, Contract Type, Policies 30d, Premium 30d, Start Date) and add Last Login column

## Technical Changes

### `src/pages/ActiveAgents.tsx` — Full rewrite
- Fetch all agents via `useAgents()` 
- Fetch all policies (no date filter) to determine "ever wrote" vs "never wrote"
- Fetch last-30-day policies separately for recent activity stats
- Compute status badges per agent based on policy history + `last_login_at` + `auth_user_id`
- Render clickable summary pills at top
- Add status filter to existing filter bar
- Render multi-badge column with the styled badges

### No database changes needed
All data (`last_login_at`, `auth_user_id`, policies) already exists.

## Files Changed
- `src/pages/ActiveAgents.tsx` — rewrite with all-agents view, status badges, summary cards, filters

