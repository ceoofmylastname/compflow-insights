CREATE POLICY "Managers can delete agents"
ON public.agents FOR DELETE TO authenticated
USING (
  tenant_id = get_agent_tenant_id_secure(auth.uid())
  AND has_role(auth.uid(), 'moderator')
);