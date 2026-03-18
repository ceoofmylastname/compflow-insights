
-- Allow all tenant members to create invites (not just owners)
DROP POLICY "Owners can create invites" ON public.invites;

CREATE POLICY "Tenant members can create invites"
ON public.invites FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = get_current_agent_tenant_id()
);

-- Allow non-owners to pre-create placeholder agent records for invitees
CREATE POLICY "Agents can insert invited agents"
ON public.agents FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = get_current_agent_tenant_id()
  AND is_owner = false
  AND auth_user_id IS NULL
);
