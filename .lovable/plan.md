

# Smoke Test Audit Results

I've reviewed every file involved in each step. Here are the results:

---

## Step 1: Owner Signup — WILL PASS
Auto-confirm is now enabled, so `signUp()` returns a session immediately. The flow:
1. Insert into `tenants` — RLS allows because `NOT EXISTS(agents where auth_user_id = uid)` is true for a new user
2. Insert into `agents` with `auth_user_id = uid, is_owner = true` — RLS allows because `auth_user_id = auth.uid()`
3. Navigate to `/onboarding`

No issues expected.

## Step 2: CSV Agent Import — WILL PASS
Owner is authenticated, `is_owner = true`, tenant_id matches. The "Owners can insert agents" RLS policy passes. Upsert uses `onConflict: "email,tenant_id"`. Both agents will be created with `is_owner: false` and their upline relationship preserved.

## Step 3: Generate Invite Link — WILL FAIL
**The `InviteAgentModal` does not generate or display an invite link.** It creates the invite row with a token in the database (line 30-37 of InviteAgentModal.tsx) and shows a toast "Invite sent to {email}", but:
- No invite URL is constructed or shown to the user
- No copy-to-clipboard functionality exists
- The user has no way to get the `/signup?invite=TOKEN` URL

**Fix needed:** After creating the invite, construct and display the URL `${window.location.origin}/signup?invite=${token}` with a copy button.

## Step 4: Invite Signup — WILL PASS (if Step 3 is fixed)
Assuming you manually navigate to `/signup?invite=TOKEN`:
1. Invite lookup uses anon SELECT policy (`true`) — works
2. Email field pre-filled and `disabled={isInviteFlow}` — locked correctly
3. After signup, the code finds the existing agent by `email + tenant_id + auth_user_id IS NULL` and updates it with `auth_user_id = userId`
4. RLS "Invited agents can claim their record" policy validates: `auth_user_id IS NULL`, `email = jwt.email`, matching invite exists — passes
5. Invite marked as accepted

One concern: the UPDATE at line 88 sends `first_name: firstName || undefined`. Using `undefined` means the field is omitted from the payload, so existing CSV-imported values are preserved. This is correct behavior.

## Step 5: Tenant Isolation — WILL PASS
The claimed agent's `auth_user_id` is set. RLS on agents filters by `tenant_id = get_current_agent_tenant_id()` AND `(auth_user_id = uid OR id IN downline)`. They'll see themselves plus their downline only, not the owner or other branches.

## Step 6: Policy CSV Import — WILL PASS
Resolution logic: checks `carrier_agent_aliases` first (will be empty initially), then falls back to `agents.npn` match. If the CSV's `writing_agent_id` matches an agent's NPN from Step 2, `resolved_agent_id` will be populated. Policies will appear in Book of Business with the "Writing Agent" column showing the resolved agent's name.

## Step 7: fire-webhook — WILL PASS (conditionally)
During policy import, if `status === "Active"` and a `webhook_configs` row exists for the tenant with `is_active = true`, the edge function is invoked. No webhook config is set up by default, so **this will silently skip** unless you first add a webhook URL in Settings.

---

## Summary

| Step | Result | Blocker |
|------|--------|---------|
| 1. Owner signup | PASS | — |
| 2. CSV agent import | PASS | — |
| 3. Generate invite link | **FAIL** | InviteAgentModal doesn't show the invite URL |
| 4. Invite signup | PASS* | *Requires Step 3 fix |
| 5. Tenant isolation | PASS | — |
| 6. Policy CSV import | PASS | — |
| 7. fire-webhook | PASS* | *Requires webhook_config row in Settings |

## Implementation Plan

**Single fix needed:** Update `InviteAgentModal` to display the generated invite URL after creating the invite. After the insert succeeds:
1. Build the URL: `` `${window.location.origin}/signup?invite=${token}` ``
2. Show it in the modal with a "Copy Link" button using `navigator.clipboard.writeText()`
3. Keep the success toast but don't close the modal immediately so the user can copy the link

This is a ~15-line change to `src/components/agents/InviteAgentModal.tsx`.

