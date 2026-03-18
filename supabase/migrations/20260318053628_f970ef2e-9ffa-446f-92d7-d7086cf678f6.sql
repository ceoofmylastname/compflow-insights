
DROP POLICY "Agents can view themselves and downline" ON public.agents;

CREATE POLICY "Agents can view themselves and downline"
ON public.agents FOR SELECT TO authenticated
USING (
  tenant_id = get_current_agent_tenant_id()
  AND (
    auth_user_id = auth.uid()
    OR id IN (SELECT get_downline_agent_ids(get_current_agent_email()))
    OR is_tenant_owner(auth.uid())
  )
);
