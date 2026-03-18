
-- Create positions table
CREATE TABLE public.positions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  title text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view positions" ON public.positions FOR SELECT TO authenticated USING (tenant_id = get_current_agent_tenant_id());
CREATE POLICY "Owners can insert positions" ON public.positions FOR INSERT TO authenticated WITH CHECK (tenant_id = get_current_agent_tenant_id() AND is_tenant_owner(auth.uid()));
CREATE POLICY "Owners can update positions" ON public.positions FOR UPDATE TO authenticated USING (tenant_id = get_current_agent_tenant_id() AND is_tenant_owner(auth.uid()));
CREATE POLICY "Owners can delete positions" ON public.positions FOR DELETE TO authenticated USING (tenant_id = get_current_agent_tenant_id() AND is_tenant_owner(auth.uid()));

-- Create payroll_runs table
CREATE TABLE public.payroll_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  total_amount numeric NOT NULL DEFAULT 0,
  agent_count integer NOT NULL DEFAULT 0,
  processed_by uuid REFERENCES public.agents(id),
  processed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view payroll runs" ON public.payroll_runs FOR SELECT TO authenticated USING (tenant_id = get_current_agent_tenant_id() AND is_tenant_owner(auth.uid()));
CREATE POLICY "Owners can insert payroll runs" ON public.payroll_runs FOR INSERT TO authenticated WITH CHECK (tenant_id = get_current_agent_tenant_id() AND is_tenant_owner(auth.uid()));
CREATE POLICY "Owners can update payroll runs" ON public.payroll_runs FOR UPDATE TO authenticated USING (tenant_id = get_current_agent_tenant_id() AND is_tenant_owner(auth.uid()));
CREATE POLICY "Owners can delete payroll runs" ON public.payroll_runs FOR DELETE TO authenticated USING (tenant_id = get_current_agent_tenant_id() AND is_tenant_owner(auth.uid()));

-- Create commission_rate_adjustments table
CREATE TABLE public.commission_rate_adjustments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  carrier text NOT NULL,
  product text NOT NULL,
  position text NOT NULL,
  adjustment_rate numeric NOT NULL,
  start_date date NOT NULL,
  end_date date,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commission_rate_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view rate adjustments" ON public.commission_rate_adjustments FOR SELECT TO authenticated USING (tenant_id = get_current_agent_tenant_id());
CREATE POLICY "Owners can insert rate adjustments" ON public.commission_rate_adjustments FOR INSERT TO authenticated WITH CHECK (tenant_id = get_current_agent_tenant_id() AND is_tenant_owner(auth.uid()));
CREATE POLICY "Owners can update rate adjustments" ON public.commission_rate_adjustments FOR UPDATE TO authenticated USING (tenant_id = get_current_agent_tenant_id() AND is_tenant_owner(auth.uid()));
CREATE POLICY "Owners can delete rate adjustments" ON public.commission_rate_adjustments FOR DELETE TO authenticated USING (tenant_id = get_current_agent_tenant_id() AND is_tenant_owner(auth.uid()));

-- Add missing columns to existing tables
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.agent_contracts ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS draft_saved_at timestamptz;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;
