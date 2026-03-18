-- Issue 1: Allow agents to insert their own policies
CREATE POLICY "Agents can insert own policies"
ON public.policies FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = get_current_agent_tenant_id()
  AND resolved_agent_id IN (
    SELECT id FROM public.agents WHERE auth_user_id = auth.uid()
  )
);

-- Issue 2: Fix auto-claim policy to use JWT instead of auth.users
DROP POLICY "Auto-claim agent record by email match" ON public.agents;
CREATE POLICY "Auto-claim agent record by email match"
ON public.agents FOR UPDATE TO authenticated
USING (auth_user_id IS NULL AND email = (auth.jwt() ->> 'email'))
WITH CHECK (auth_user_id = auth.uid());