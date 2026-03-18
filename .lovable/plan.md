

# Auto-populate agent settings from signup data

## Problem
The signup form does not collect a phone number, yet the Settings profile page has a phone field. The user expects phone (along with name and email) to be captured at signup and pre-filled in Settings.

## Changes

### 1. Add phone field to Signup form (`src/pages/Signup.tsx`)
- Add `phone` state variable
- Add a Phone input field after the NPN field
- Pass `phone` when creating/updating the agent record in all three flows:
  - **Invite flow (claim)**: add `phone: phone || undefined` to the update call
  - **Invite flow (new agent)**: add `phone: phone || null` to the insert
  - **Unclaimed agent flow**: add `phone: phone || undefined` to the update
  - **Owner signup flow**: add `phone: phone || null` to the insert

### 2. No changes needed to Settings
The Settings page already reads `currentAgent.phone` and pre-fills the field. Once the agent record has phone saved from signup, it will auto-populate.

## Files changed
- `src/pages/Signup.tsx` — add phone input + include phone in all agent insert/update calls

