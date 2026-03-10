-- Tighten the tenant insert policy - only allow if user doesn't already have a tenant
DROP POLICY "Allow signup to create tenant" ON public.tenants;
CREATE POLICY "Allow signup to create tenant" ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (NOT EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid()));