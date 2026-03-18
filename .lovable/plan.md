

# Scoreboard Shows No Data Despite Submitted Policies

## Problem
The Scoreboard page queries `commission_payouts` to build its rankings. However, commission payouts only exist after the commission engine runs, which requires **Commission Levels** to be configured first (carrier + product + position + rate).

Current state:
- **1 policy** exists (Transamerica / FE Express, $12,000 premium, agent position "Agent")
- **0 commission levels** configured
- **0 commission payouts** generated

Since there are no commission levels, the engine has no rate to apply, so no payouts are created, and the scoreboard shows nothing.

## Two Options

### Option A: Require commission setup first (no code change)
The existing flow is working as designed. You need to:
1. Go to **Commission Levels** in the sidebar
2. Add a level for carrier "Transamerica", product "FE Express", position "Agent" with a rate and start date
3. Then recalculate commissions — payouts will be generated and the scoreboard will populate

### Option B: Make scoreboard work from policies directly (code change)
Modify the Scoreboard to pull data from `policies` instead of (or in addition to) `commission_payouts`. This way agents see their policy count and premium totals even before commission levels are configured. Commission columns would show $0 until rates are set up.

**Changes in `src/pages/Scoreboard.tsx`:**
- Replace the `usePayoutsWithPolicies` query with a direct `policies` query (filtering by date, carrier, status, lead source)
- Aggregate policy count and total premium per `resolved_agent_id`
- Keep commission totals from payouts as a supplementary data source (left-joined conceptually)
- This ensures the scoreboard always shows activity even without commission configuration

## Recommendation
**Option B** is better UX — agents who post deals should immediately see themselves on the scoreboard ranked by premium, without waiting for the owner to configure commission levels.

