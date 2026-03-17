-- Task 1: Agent contracts table
CREATE TABLE public.agent_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL,
  agent_number TEXT,
  contract_type TEXT NOT NULL DEFAULT 'Direct Pay',
  status TEXT NOT NULL DEFAULT 'Active',
  start_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, agent_id, carrier)
);

ALTER TABLE public.agent_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view contracts" ON public.agent_contracts
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.agents WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE POLICY "Owners can manage contracts" ON public.agent_contracts
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.agents WHERE auth_user_id = auth.uid() LIMIT 1)
    AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));

-- Task 3: Billing snapshots table
CREATE TABLE public.billing_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  active_agent_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, snapshot_date)
);

ALTER TABLE public.billing_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view billing snapshots" ON public.billing_snapshots
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.agents WHERE auth_user_id = auth.uid() LIMIT 1)
    AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));

CREATE OR REPLACE FUNCTION public.snapshot_active_agents(p_tenant_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  active_count integer;
BEGIN
  SELECT COUNT(DISTINCT resolved_agent_id)
  INTO active_count
  FROM public.policies
  WHERE tenant_id = p_tenant_id
    AND created_at >= now() - interval '30 days';

  INSERT INTO public.billing_snapshots (tenant_id, snapshot_date, active_agent_count)
  VALUES (p_tenant_id, CURRENT_DATE, active_count)
  ON CONFLICT (tenant_id, snapshot_date) DO UPDATE
    SET active_agent_count = EXCLUDED.active_agent_count;

  RETURN active_count;
END;
$$;

-- Task 4: Refs tracking columns
ALTER TABLE public.policies
ADD COLUMN IF NOT EXISTS refs_collected INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS refs_sold INTEGER DEFAULT 0;

-- Task 5: Notes and effective_date columns
ALTER TABLE public.policies
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS effective_date DATE;
