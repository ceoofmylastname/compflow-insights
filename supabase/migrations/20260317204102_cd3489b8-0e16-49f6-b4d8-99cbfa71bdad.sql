
-- 1. Add missing columns to tenants table
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS subdomain text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS custom_domain text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS cloudflare_hostname_id text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS domain_txt_verification text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS domain_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS domain_status text NOT NULL DEFAULT 'none';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan text;

-- 2. Create helper function to check agent ownership without RLS recursion
CREATE OR REPLACE FUNCTION public.is_tenant_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agents
    WHERE auth_user_id = _user_id AND is_owner = true
  )
$$;

-- 3. Create helper function to get agent tenant without RLS
CREATE OR REPLACE FUNCTION public.get_agent_tenant_id_secure(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.agents WHERE auth_user_id = _user_id LIMIT 1
$$;

-- 4. Fix agents UPDATE policies that cause infinite recursion
-- Drop problematic policies
DROP POLICY IF EXISTS "Owners can update agents" ON public.agents;
DROP POLICY IF EXISTS "Owners can delete agents" ON public.agents;
DROP POLICY IF EXISTS "Owners can insert agents" ON public.agents;

-- Recreate without recursive self-reference
CREATE POLICY "Owners can update agents" ON public.agents
FOR UPDATE TO authenticated
USING (
  tenant_id = get_agent_tenant_id_secure(auth.uid())
  AND is_tenant_owner(auth.uid())
);

CREATE POLICY "Owners can delete agents" ON public.agents
FOR DELETE TO authenticated
USING (
  tenant_id = get_agent_tenant_id_secure(auth.uid())
  AND is_tenant_owner(auth.uid())
);

CREATE POLICY "Owners can insert agents" ON public.agents
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = get_current_agent_tenant_id()
  AND is_tenant_owner(auth.uid())
);

-- 5. Create resolve_tenant_by_domain function
CREATE OR REPLACE FUNCTION public.resolve_tenant_by_domain(p_hostname text)
RETURNS TABLE(
  id uuid,
  name text,
  agency_name text,
  logo_url text,
  primary_color text,
  subdomain text,
  custom_domain text,
  domain_verified boolean,
  plan text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.agency_name, t.logo_url, t.primary_color,
         t.subdomain, t.custom_domain, t.domain_verified, t.plan
  FROM public.tenants t
  WHERE (t.custom_domain = p_hostname AND t.domain_verified = true)
     OR (t.subdomain IS NOT NULL AND p_hostname = t.subdomain || '.baseshophq.com')
  LIMIT 1;
$$;
