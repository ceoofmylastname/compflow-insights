-- Feature parity migration: positions, payroll, rate adjustments, drafts, agent archive, contracts extra cols, policy extra cols, agent phone

-- ========== Task 1: Positions ==========
CREATE TABLE IF NOT EXISTS public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, title)
);

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view positions" ON public.positions
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id());

CREATE POLICY "Owners can manage positions" ON public.positions
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id()
    AND public.is_tenant_owner(auth.uid()));

-- Position history
CREATE TABLE IF NOT EXISTS public.agent_position_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  position_title TEXT NOT NULL,
  upline_email TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_position_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage position history" ON public.agent_position_history
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id()
    AND public.is_tenant_owner(auth.uid()));

CREATE POLICY "Agents can view own position history" ON public.agent_position_history
  FOR SELECT TO authenticated
  USING (agent_id IN (SELECT id FROM public.agents WHERE auth_user_id = auth.uid()));

-- ========== Task 3: Drafts ==========
ALTER TABLE public.policies
ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS draft_saved_at TIMESTAMPTZ;

-- ========== Task 4: Payroll ==========
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  total_amount NUMERIC(14,2) DEFAULT 0,
  agent_count INTEGER DEFAULT 0,
  processed_by UUID REFERENCES public.agents(id),
  processed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, period_start, period_end)
);

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage payroll runs" ON public.payroll_runs
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id()
    AND public.is_tenant_owner(auth.uid()));

-- ========== Task 5: Contracts extra columns ==========
ALTER TABLE public.agent_contracts
ADD COLUMN IF NOT EXISTS referral_code TEXT,
ADD COLUMN IF NOT EXISTS loa_upline_agent_id UUID REFERENCES public.agents(id),
ADD COLUMN IF NOT EXISTS loa_upline_agent_number TEXT;

-- ========== Task 6: Policy extra fields ==========
ALTER TABLE public.policies
ADD COLUMN IF NOT EXISTS modal_premium NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS billing_interval TEXT;

-- ========== Task 8: Agent phone ==========
ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS phone TEXT;

-- ========== Task 12: Archived agents ==========
ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.agents(id);

-- ========== Task 14: Rate adjustments ==========
CREATE TABLE IF NOT EXISTS public.commission_rate_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL,
  product TEXT NOT NULL,
  position TEXT NOT NULL,
  adjustment_rate NUMERIC(6,4) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, carrier, product, position, start_date)
);

ALTER TABLE public.commission_rate_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view adjustments" ON public.commission_rate_adjustments
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id());

CREATE POLICY "Owners can manage adjustments" ON public.commission_rate_adjustments
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id()
    AND public.is_tenant_owner(auth.uid()));
