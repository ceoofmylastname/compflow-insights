
-- Allow agents to update their own record (e.g. last_login_at)
CREATE POLICY "Agents can update own record" ON public.agents
FOR UPDATE TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());
