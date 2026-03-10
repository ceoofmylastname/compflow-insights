
CREATE TABLE public.carrier_agent_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL,
  writing_agent_id TEXT NOT NULL,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, carrier, writing_agent_id)
);

ALTER TABLE public.carrier_agent_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view aliases" ON public.carrier_agent_aliases
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.agents WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE POLICY "Owners can manage aliases" ON public.carrier_agent_aliases
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM public.agents WHERE auth_user_id = auth.uid() LIMIT 1)
    AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true)
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.agents WHERE auth_user_id = auth.uid() LIMIT 1)
    AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true)
  );
