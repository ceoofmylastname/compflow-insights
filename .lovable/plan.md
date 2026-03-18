

# Modernize Org Chart for Scale (100–1,000+ Agents)

## Current Problems
- Renders all expanded nodes as DOM elements simultaneously — will choke at 100+ agents
- Vertical stacking layout wastes horizontal space and doesn't scale visually
- Cards are basic; no activity indicators or live-data emphasis
- No virtualization or lazy rendering for large trees
- Connector lines are simple divs with no visual polish

## Design Direction
Modern, dark-themed org chart inspired by tools like Miro/Figma org charts — glassmorphism cards, gradient connector lines, animated expand/collapse, and a minimap for navigation at scale.

## Changes

### 1. Redesign NodeCard — Glassmorphism + Activity Indicators
- Frosted glass card style: `backdrop-blur-xl bg-card/80 border border-white/10`
- Larger avatar with gradient ring based on position color
- Activity pulse dot (green = active last 7d, amber = 30d, red = dormant)
- Stats row with subtle sparkline-style indicators (up/down arrows for premium trends)
- Hover state: subtle glow/scale effect with `transition-all duration-200`
- Root node gets a crown/star icon and slightly larger size

### 2. Optimize for Scale — Virtualized Rendering
- Only render nodes that are expanded (already done) but add **depth-limiting**: auto-collapse beyond depth 3 on initial load
- Add a `maxInitialDepth` prop — only first 2 levels expanded by default
- For nodes with 10+ children, show a condensed row: "Show all 47 reports" button that expands into a paginated grid (4 columns) instead of a single horizontal row
- Memoize subtree components aggressively with `React.memo` + stable context refs

### 3. Connector Lines — Gradient + Animated
- Replace plain `bg-border` lines with gradient lines using CSS: `bg-gradient-to-b from-primary/40 to-border`
- Add subtle pulse animation on expand using CSS `@keyframes`
- Rounded connector corners using small SVG arcs at junctions

### 4. Minimap + Zoom Controls
- Add a small minimap overlay (bottom-right) showing the full tree structure as dots/lines
- Zoom in/out buttons (+/-) that scale the tree container via CSS transform
- Fit-to-screen button that auto-calculates scale based on tree width vs viewport
- Pan via click-drag on the canvas (using `onMouseDown/Move/Up` handlers)

### 5. Summary Stats Bar
- Above the tree, show aggregate stats for the visible hierarchy: Total Agents, Total Premium, Total Commission, Avg per Agent
- Updates in real-time as data changes (leverages existing React Query cache)

### 6. Enhanced Data Freshness
- Stats already pull from `usePolicies` and `useCommissionPayouts` which use React Query with 60s stale time — data is already live/reactive
- Add a subtle "Last updated X seconds ago" indicator
- Add shimmer/skeleton state on individual cards while data loads

## Files Changed
- `src/components/agents/OrgTree.tsx` — Full rewrite with all enhancements above

## No database changes needed
All data sources (policies, commission_payouts, agents) are already queried reactively.

