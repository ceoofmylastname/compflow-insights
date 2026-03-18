DROP POLICY "Tenant members can view agent contracts" ON public.agent_contracts;

CREATE POLICY "Agents can view own and downline contracts"
ON public.agent_contracts FOR SELECT TO authenticated
USING (
  tenant_id = get_current_agent_tenant_id()
  AND (
    agent_id IN (SELECT id FROM public.agents WHERE auth_user_id = auth.uid())
    OR agent_id IN (SELECT get_downline_agent_ids(get_current_agent_email()))
    OR is_tenant_owner(auth.uid())
  )
);