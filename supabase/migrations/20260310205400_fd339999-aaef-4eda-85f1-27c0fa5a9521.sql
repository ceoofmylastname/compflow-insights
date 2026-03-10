-- Drop global unique on agents.email; composite (email, tenant_id) is sufficient
ALTER TABLE public.agents DROP CONSTRAINT agents_email_key;

-- Allow invited agents to claim their record by setting auth_user_id
CREATE POLICY "Invited agents can claim their record" ON public.agents
  FOR UPDATE TO authenticated
  USING (
    auth_user_id IS NULL
    AND email = (SELECT auth.jwt()->>'email')
    AND EXISTS (
      SELECT 1 FROM public.invites
      WHERE invitee_email = agents.email
        AND tenant_id = agents.tenant_id
        AND accepted = false
    )
  )
  WITH CHECK (
    auth_user_id = auth.uid()
  );