

# Fix Invite Link to Use Branded Domain

## Problem
The invite link is generated using `window.location.origin`, which returns the Lovable preview domain. It should use the app's branded domain instead.

## Fix
In `src/components/agents/InviteAgentModal.tsx`, change line 60 from:
```typescript
const url = `${window.location.origin}/signup?invite=${token}`;
```
to use the `VITE_APP_HOSTNAME` environment variable (already defined in `.env.example` as `baseshophq.com`):
```typescript
const appHost = import.meta.env.VITE_APP_HOSTNAME || window.location.host;
const url = `https://${appHost}/signup?invite=${token}`;
```

This ensures invite links always point to `https://baseshophq.com/signup?invite=...` regardless of where the modal is opened from.

## Additional Step
Add `VITE_APP_HOSTNAME=baseshophq.com` to the `.env` file so the variable is available at runtime.

## Also: Fix Build Errors
The build has many errors from missing tables (`payroll_runs`, `positions`, `commission_rate_adjustments`) and missing columns (`phone`, `referral_code`, `draft_saved_at`). These need database migrations to resolve. I will create the missing tables and columns in the same implementation pass.

## Changes Summary
| File | Change |
|------|--------|
| `InviteAgentModal.tsx` | Use `VITE_APP_HOSTNAME` for invite URL |
| `.env` | Add `VITE_APP_HOSTNAME=baseshophq.com` |
| Database migration | Create `payroll_runs`, `positions`, `commission_rate_adjustments` tables; add `phone` to `agents`, `referral_code` to `agent_contracts`, `draft_saved_at` to `policies` |

