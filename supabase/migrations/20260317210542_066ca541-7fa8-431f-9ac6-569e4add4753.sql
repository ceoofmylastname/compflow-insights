
-- Drop existing invites policies that cause recursion
DROP POLICY IF EXISTS "Owners can view invites" ON public.invites;
DROP POLICY IF EXISTS "Owners can create invites" ON public.invites;
DROP POLICY IF EXISTS "Owners can delete invites" ON public.invites;
DROP POLICY IF EXISTS "Invitees can accept invites" ON public.invites;

-- Recreate using SECURITY DEFINER functions to break recursion
CREATE POLICY "Owners can view invites" ON public.invites
FOR SELECT TO authenticated
USING (tenant_id = get_current_agent_tenant_id() AND is_tenant_owner(auth.uid()));

CREATE POLICY "Owners can create invites" ON public.invites
FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_current_agent_tenant_id() AND is_tenant_owner(auth.uid()));

CREATE POLICY "Owners can delete invites" ON public.invites
FOR DELETE TO authenticated
USING (tenant_id = get_current_agent_tenant_id() AND is_tenant_owner(auth.uid()));

CREATE POLICY "Invitees can accept invites" ON public.invites
FOR UPDATE TO authenticated
USING (invitee_email = get_current_agent_email());
