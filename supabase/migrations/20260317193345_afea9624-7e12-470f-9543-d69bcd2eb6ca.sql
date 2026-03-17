
-- Create agent_contracts table
CREATE TABLE public.agent_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  carrier text NOT NULL,
  agent_number text,
  contract_type text NOT NULL DEFAULT 'Direct Pay',
  status text NOT NULL DEFAULT 'active',
  start_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view agent contracts"
  ON public.agent_contracts FOR SELECT TO authenticated
  USING (tenant_id = get_current_agent_tenant_id());

CREATE POLICY "Owners can insert agent contracts"
  ON public.agent_contracts FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM agents WHERE auth_user_id = auth.uid() AND is_owner = true));

CREATE POLICY "Owners can update agent contracts"
  ON public.agent_contracts FOR UPDATE TO authenticated
  USING (tenant_id = get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM agents WHERE auth_user_id = auth.uid() AND is_owner = true));

CREATE POLICY "Owners can delete agent contracts"
  ON public.agent_contracts FOR DELETE TO authenticated
  USING (tenant_id = get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM agents WHERE auth_user_id = auth.uid() AND is_owner = true));

-- Create carrier_profiles table
CREATE TABLE public.carrier_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  carrier_name text NOT NULL,
  column_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  header_fingerprint text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, carrier_name)
);

ALTER TABLE public.carrier_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view carrier profiles"
  ON public.carrier_profiles FOR SELECT TO authenticated
  USING (tenant_id = get_current_agent_tenant_id());

CREATE POLICY "Owners can insert carrier profiles"
  ON public.carrier_profiles FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM agents WHERE auth_user_id = auth.uid() AND is_owner = true));

CREATE POLICY "Owners can update carrier profiles"
  ON public.carrier_profiles FOR UPDATE TO authenticated
  USING (tenant_id = get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM agents WHERE auth_user_id = auth.uid() AND is_owner = true));

CREATE POLICY "Owners can delete carrier profiles"
  ON public.carrier_profiles FOR DELETE TO authenticated
  USING (tenant_id = get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM agents WHERE auth_user_id = auth.uid() AND is_owner = true));

-- Create billing_snapshots table
CREATE TABLE public.billing_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  active_agent_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view billing snapshots"
  ON public.billing_snapshots FOR SELECT TO authenticated
  USING (tenant_id = get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM agents WHERE auth_user_id = auth.uid() AND is_owner = true));

CREATE POLICY "Owners can insert billing snapshots"
  ON public.billing_snapshots FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM agents WHERE auth_user_id = auth.uid() AND is_owner = true));

-- Create snapshot_active_agents function
CREATE OR REPLACE FUNCTION public.snapshot_active_agents(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agent_count integer;
BEGIN
  SELECT COUNT(*) INTO agent_count
  FROM public.agents
  WHERE tenant_id = p_tenant_id AND auth_user_id IS NOT NULL;

  INSERT INTO public.billing_snapshots (tenant_id, snapshot_date, active_agent_count)
  VALUES (p_tenant_id, CURRENT_DATE, agent_count);

  RETURN agent_count;
END;
$$;
