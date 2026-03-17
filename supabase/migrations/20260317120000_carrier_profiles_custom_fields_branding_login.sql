-- carrier_profiles table (Task 1: Carrier Import Engine)
CREATE TABLE IF NOT EXISTS public.carrier_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  carrier_name TEXT NOT NULL,
  column_mappings JSONB NOT NULL DEFAULT '{}',
  custom_fields JSONB NOT NULL DEFAULT '[]',
  header_fingerprint TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, carrier_name)
);

ALTER TABLE public.carrier_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view carrier profiles"
  ON public.carrier_profiles FOR SELECT
  USING (tenant_id = get_current_agent_tenant_id());

CREATE POLICY "Owners can manage carrier profiles"
  ON public.carrier_profiles FOR ALL
  USING (tenant_id = get_current_agent_tenant_id());

-- policies.custom_fields (Task 1)
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';

-- agents.last_login_at (Task 4)
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- tenants branding columns (Task 6)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS agency_name TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#6366f1';
