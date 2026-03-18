
Problem found:
- The link you got is coming from a different invite flow than the modal we inspected.
- `src/components/agents/InviteAgentModal.tsx` already builds links with `VITE_APP_HOSTNAME`.
- But `src/pages/AgentRoster.tsx` still uses:
  ```ts
  const url = `${window.location.origin}/signup?invite=${token}`;
  ```
  so when you copy an invite from the roster page, it uses the current Lovable preview/staging domain.
- I also checked the current project URLs: the project is still published on a Lovable domain, not on `baseshophq.com`, so even after code is fixed, the branded domain must also be connected and active in project domain settings.

Plan:
1. Standardize invite URL generation
   - Replace the roster-page copy flow so it uses the same branded hostname logic as the invite modal.
   - Best approach: use one shared helper for app URLs so both places always match.

2. Make branding consistent across auth flows
   - Update signup email redirect and password-reset redirect to use the same branded base URL instead of `window.location.origin`.
   - This prevents future auth emails and redirects from bouncing users to Lovable domains.

3. Verify runtime domain configuration
   - Confirm `VITE_APP_HOSTNAME` is actually available in the running environment, not just `.env.example`.
   - If it is missing at runtime, the code falls back to the current host, which explains why Lovable URLs still appear.

4. Confirm custom domain is connected
   - `baseshophq.com` must be connected as an active custom domain for the project.
   - Right now the project URLs I can see are still Lovable-hosted, so the branded link may not work publicly until the custom domain is active and set as primary.

What I would change:
- `src/pages/AgentRoster.tsx`
  - Replace `window.location.origin` invite generation with branded hostname logic.
- `src/pages/Signup.tsx`
  - Replace `emailRedirectTo: window.location.origin` with a branded URL helper.
- `src/pages/ForgotPassword.tsx`
  - Replace reset redirect based on `window.location.origin` with the same branded URL helper.
- Optional but recommended:
  - Create a small shared utility like `src/lib/app-url.ts`:
    ```ts
    const APP_HOSTNAME = import.meta.env.VITE_APP_HOSTNAME || window.location.host;
    export const getAppBaseUrl = () => `https://${APP_HOSTNAME}`;
    ```
  - Then use it everywhere for invite/signup/reset links.

Expected result after implementation:
- Copying an invite from Agent Roster will generate:
  ```text
  https://baseshophq.com/signup?invite=...
  ```
  instead of a Lovable URL.
- Invite modal and roster copy action will behave the same.
- Auth redirects will stay on your branded domain too.

Important note:
- If `baseshophq.com` is not yet connected and active for this project, the code fix alone won’t fully solve the real-world experience. The domain also needs to be connected in project domain settings and set as the primary domain.