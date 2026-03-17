-- Carrier Management System: carriers + carrier_products tables

-- Table: carriers
CREATE TABLE public.carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;

-- RLS: carriers
CREATE POLICY "Tenant members can view carriers" ON public.carriers
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id());

CREATE POLICY "Owners can insert carriers" ON public.carriers
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_agent_tenant_id()
    AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));

CREATE POLICY "Owners can update carriers" ON public.carriers
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id()
    AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));

CREATE POLICY "Owners can delete carriers" ON public.carriers
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id()
    AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));

-- Table: carrier_products
CREATE TABLE public.carrier_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID NOT NULL REFERENCES public.carriers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(carrier_id, name)
);

ALTER TABLE public.carrier_products ENABLE ROW LEVEL SECURITY;

-- RLS: carrier_products (scoped through parent carrier)
CREATE POLICY "Tenant members can view carrier products" ON public.carrier_products
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.carriers
    WHERE carriers.id = carrier_products.carrier_id
      AND carriers.tenant_id = public.get_current_agent_tenant_id()
  ));

CREATE POLICY "Owners can insert carrier products" ON public.carrier_products
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.carriers
    WHERE carriers.id = carrier_products.carrier_id
      AND carriers.tenant_id = public.get_current_agent_tenant_id()
      AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true)
  ));

CREATE POLICY "Owners can update carrier products" ON public.carrier_products
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.carriers
    WHERE carriers.id = carrier_products.carrier_id
      AND carriers.tenant_id = public.get_current_agent_tenant_id()
      AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true)
  ));

CREATE POLICY "Owners can delete carrier products" ON public.carrier_products
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.carriers
    WHERE carriers.id = carrier_products.carrier_id
      AND carriers.tenant_id = public.get_current_agent_tenant_id()
      AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true)
  ));
