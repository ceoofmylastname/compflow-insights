

# Gate CSV Import to Owners & Managers Only

## What This Does
Restricts CSV import functionality so only owners and managers (agents with downline) can upload data. Regular agents can only use "Post a Deal." This prevents double-counting, incorrect attribution, and bypasses of quality control.

## Permission Logic
```ts
const canImport = currentAgent?.is_owner === true || 
  (agents ?? []).some(a => a.upline_email === currentAgent?.email);
```

## Files to Create

### `src/hooks/useCanImport.ts`
New shared hook returning `{ canImport: boolean, isLoading: boolean }`. Uses `useCurrentAgent` and `useAgents` to determine if the user is an owner or has downline agents.

## Files to Edit

### `src/components/shared/CSVImportModal.tsx`
- Import `useCanImport`
- At top of component, if `!canImport`, show toast "Only owners and managers can import data" and close the modal by calling `onOpenChange(false)` — return null for modal content

### `src/components/import/PolicyImportWizard.tsx`
- Same pattern: import `useCanImport`, return null if `!canImport`

### `src/pages/Dashboard.tsx`
- Import `useCanImport`
- Wrap the "Import" button (line ~146) with `{canImport && ...}`
- "Post a Deal" button stays visible for everyone

### `src/pages/BookOfBusiness.tsx`
- Import `useCanImport`
- No import button currently visible here (only "Post a Deal" and "Columns"), so no button to hide
- Update the empty state message (line 311): if `!canImport`, show "Your manager will upload carrier reports which will automatically populate your book of business. You can also post individual deals using the Post a Deal button."

### `src/pages/AgentRoster.tsx`
- Import `useCanImport`
- The "Template" download button (line 237-239): wrap with `{canImport && ...}`
- The "Invite Agent" button (line 240-242): already gated by owner in practice but keep visible — the invite modal itself is owner-gated

### `src/pages/CommissionLevels.tsx`
- Import `useCanImport`
- The import button section (line 217-227): change `isOwner` gate to `canImport` for the "Import CSV" button specifically
- Template and Export buttons can stay owner-only as they currently are

### `src/pages/Onboarding.tsx`
- Update step descriptions:
  - Step 1: "Owners only. Upload your team hierarchy via CSV."
  - Step 2: "Owners only. Upload your carrier comp grids."
  - Step 3: "Owners and managers. Upload carrier policy reports to populate your book of business."
  - Step 4: "Send invite links so your agents can claim their accounts and enter their writing numbers."

### `src/components/policies/PostDealModal.tsx`
- **No changes.** Confirmed: no `canImport` check will be added. All agents can post deals.

## Implementation Order
1. Create `useCanImport.ts`
2. Gate `CSVImportModal.tsx` and `PolicyImportWizard.tsx`
3. Hide import buttons in Dashboard, AgentRoster, CommissionLevels
4. Update empty state messaging in BookOfBusiness
5. Update Onboarding step descriptions

