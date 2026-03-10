-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Table: tenants
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Table: agents
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  npn TEXT,
  position TEXT,
  upline_email TEXT,
  start_date DATE,
  annual_goal NUMERIC(12,2),
  contract_type TEXT,
  is_owner BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Validation trigger for agents contract_type
CREATE OR REPLACE FUNCTION public.validate_agent_contract_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contract_type IS NOT NULL AND NEW.contract_type NOT IN ('Direct Pay', 'LOA') THEN
    RAISE EXCEPTION 'Invalid contract_type. Must be Direct Pay or LOA';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_agent_contract_type
  BEFORE INSERT OR UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.validate_agent_contract_type();

-- Table: commission_levels
CREATE TABLE public.commission_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL,
  product TEXT NOT NULL,
  position TEXT NOT NULL,
  rate NUMERIC(6,4) NOT NULL,
  start_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.commission_levels ENABLE ROW LEVEL SECURITY;

-- Table: policies
CREATE TABLE public.policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_number TEXT,
  application_date DATE,
  writing_agent_id TEXT,
  resolved_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  client_name TEXT,
  carrier TEXT,
  product TEXT,
  annual_premium NUMERIC(12,2),
  status TEXT,
  contract_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

-- Validation trigger for policies
CREATE OR REPLACE FUNCTION public.validate_policy_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS NOT NULL AND NEW.status NOT IN ('Submitted', 'Pending', 'Active', 'Terminated') THEN
    RAISE EXCEPTION 'Invalid policy status. Must be Submitted, Pending, Active, or Terminated';
  END IF;
  IF NEW.contract_type IS NOT NULL AND NEW.contract_type NOT IN ('Direct Pay', 'LOA') THEN
    RAISE EXCEPTION 'Invalid contract_type. Must be Direct Pay or LOA';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_policy_status
  BEFORE INSERT OR UPDATE ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.validate_policy_status();

-- Table: commission_payouts
CREATE TABLE public.commission_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  commission_rate NUMERIC(6,4),
  commission_amount NUMERIC(12,2),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.commission_payouts ENABLE ROW LEVEL SECURITY;

-- Table: webhook_configs
CREATE TABLE public.webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  webhook_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;

-- Table: invites
CREATE TABLE public.invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invited_by_agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  invitee_upline_email TEXT,
  token TEXT NOT NULL UNIQUE,
  accepted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Table: user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Recursive downline function
CREATE OR REPLACE FUNCTION public.get_downline_agent_ids(_agent_email TEXT)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH RECURSIVE downline AS (
    SELECT id, email FROM public.agents WHERE upline_email = _agent_email
    UNION ALL
    SELECT a.id, a.email FROM public.agents a INNER JOIN downline d ON a.upline_email = d.email
  )
  SELECT id FROM downline
$$;

-- Helper functions
CREATE OR REPLACE FUNCTION public.get_current_agent_email()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT email FROM public.agents WHERE auth_user_id = auth.uid() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.get_current_agent_tenant_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT tenant_id FROM public.agents WHERE auth_user_id = auth.uid() LIMIT 1 $$;

-- RLS: tenants
CREATE POLICY "Users can view their own tenant" ON public.tenants FOR SELECT TO authenticated
  USING (id = public.get_current_agent_tenant_id());
CREATE POLICY "Allow signup to create tenant" ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (true);

-- RLS: agents
CREATE POLICY "Agents can view themselves and downline" ON public.agents FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id() AND (auth_user_id = auth.uid() OR id IN (SELECT public.get_downline_agent_ids(public.get_current_agent_email()))));
CREATE POLICY "Allow authenticated signup to create own agent" ON public.agents FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "Owners can insert agents" ON public.agents FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));
CREATE POLICY "Owners can update agents" ON public.agents FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));

-- RLS: commission_levels
CREATE POLICY "Tenant members can view commission levels" ON public.commission_levels FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id());
CREATE POLICY "Owners can insert commission levels" ON public.commission_levels FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));
CREATE POLICY "Owners can update commission levels" ON public.commission_levels FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));
CREATE POLICY "Owners can delete commission levels" ON public.commission_levels FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));

-- RLS: policies
CREATE POLICY "Agents can view policies" ON public.policies FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id() AND (resolved_agent_id IN (SELECT id FROM public.agents WHERE auth_user_id = auth.uid()) OR resolved_agent_id IN (SELECT public.get_downline_agent_ids(public.get_current_agent_email())) OR EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true)));
CREATE POLICY "Owners can insert policies" ON public.policies FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));
CREATE POLICY "Owners can update policies" ON public.policies FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));

-- RLS: commission_payouts
CREATE POLICY "Agents can view payouts" ON public.commission_payouts FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id() AND (agent_id IN (SELECT id FROM public.agents WHERE auth_user_id = auth.uid()) OR agent_id IN (SELECT public.get_downline_agent_ids(public.get_current_agent_email())) OR EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true)));
CREATE POLICY "Owners can insert payouts" ON public.commission_payouts FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));

-- RLS: webhook_configs
CREATE POLICY "Owners can view webhook configs" ON public.webhook_configs FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));
CREATE POLICY "Owners can insert webhook configs" ON public.webhook_configs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));
CREATE POLICY "Owners can update webhook configs" ON public.webhook_configs FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));
CREATE POLICY "Owners can delete webhook configs" ON public.webhook_configs FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));

-- RLS: invites
CREATE POLICY "Owners can view invites" ON public.invites FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));
CREATE POLICY "Owners can create invites" ON public.invites FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true));
CREATE POLICY "Anyone can view invite by token" ON public.invites FOR SELECT TO anon USING (true);

-- RLS: user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());