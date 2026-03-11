

# Fix Invite Agent Flow — Plan

## Problems Identified

1. **Invite doesn't create an agent record**: The modal collects Position, Contract Type, and Annual Goal but never saves them. When the invited user signs up, the Signup page looks for a pre-existing agent record to "claim" — but none exists, so it creates a bare one without the position/contract_type/annual_goal data the owner entered.

2. **No email is sent**: The system only generates a link for the owner to manually copy and share. There is no automated email. This is by design currently — it's a "copy link" flow, not an email flow.

3. **Multi-tenant SaaS architecture**: Yes, this is built as multi-tenant SaaS. Each agency owner creates their own isolated tenant. All data (agents, policies, commissions) is scoped to that tenant via RLS. Agents invited by the owner join that specific tenant. It is NOT one shared dashboard — each tenant is completely isolated.

4. **"Does agent get invited to this ecosystem"**: Yes. The invite link takes the new agent to a signup page pre-filled with their email. On signup, they join the owner's tenant and appear in the owner's Agent Roster, Scoreboard, etc.

## Fixes

### Fix 1: Pre-create agent record on invite (InviteAgentModal.tsx)

After inserting the invite row, also insert an agent record with the position, contract_type, annual_goal, and email — with `auth_user_id: null` so the signup flow can "claim" it later.

```
// After invite insert succeeds, create placeholder agent
await supabase.from("agents").insert({
  tenant_id: currentAgent.tenant_id,
  email,
  first_name: "",
  last_name: "",
  position: position || null,
  contract_type: contractType,
  annual_goal: annualGoal ? parseFloat(annualGoal) : null,
  upline_email: currentAgent.email,
  is_owner: false,
  start_date: new Date().toISOString().split("T")[0],
});
```

This makes the "claim" path in Signup.tsx work correctly — the agent record exists and gets its `auth_user_id` set on signup.

### Fix 2: Add optional email notification (nice-to-have)

Currently the flow is manual link-sharing. To add automated email invites would require setting up transactional email (custom domain + edge function). For now, I'll make the UI clearer that this is a "copy and share" flow by updating the button label from "Send Invite" to "Create Invite Link" and adding helper text.

### Files Changed

- `src/components/agents/InviteAgentModal.tsx` — pre-create agent record with collected fields, update button label and UX copy

