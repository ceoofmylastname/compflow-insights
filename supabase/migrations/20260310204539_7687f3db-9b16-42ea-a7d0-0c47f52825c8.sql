
CREATE POLICY "Owners can delete agents" ON public.agents
  FOR DELETE TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM public.agents WHERE auth_user_id = auth.uid() LIMIT 1)
    AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true)
  );

CREATE POLICY "Owners can delete invites" ON public.invites
  FOR DELETE TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM public.agents WHERE auth_user_id = auth.uid() LIMIT 1)
    AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true)
  );
