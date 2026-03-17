-- Add domain fields to tenants
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS subdomain TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS custom_domain TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS domain_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS cloudflare_hostname_id TEXT,
ADD COLUMN IF NOT EXISTS domain_txt_verification TEXT,
ADD COLUMN IF NOT EXISTS domain_cname_target TEXT DEFAULT 'proxy.baseshophq.com',
ADD COLUMN IF NOT EXISTS domain_status TEXT DEFAULT 'none';
-- domain_status values: none | pending | active | failed

-- Auto-generate subdomain from agency name on tenant creation
CREATE OR REPLACE FUNCTION public.auto_set_subdomain()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  base_slug := lower(regexp_replace(
    coalesce(NEW.name, 'agency'),
    '[^a-z0-9]', '-', 'g'
  ));
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  base_slug := left(base_slug, 30);

  final_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE subdomain = final_slug AND id != NEW.id) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  NEW.subdomain := final_slug;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_subdomain_on_insert
  BEFORE INSERT ON public.tenants
  FOR EACH ROW
  WHEN (NEW.subdomain IS NULL)
  EXECUTE FUNCTION public.auto_set_subdomain();

-- Backfill subdomains for existing tenants
DO $$
DECLARE
  t RECORD;
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER;
BEGIN
  FOR t IN SELECT id, name FROM public.tenants WHERE subdomain IS NULL LOOP
    base_slug := lower(regexp_replace(coalesce(t.name, 'agency'), '[^a-z0-9]', '-', 'g'));
    base_slug := regexp_replace(base_slug, '-+', '-', 'g');
    base_slug := trim(both '-' from base_slug);
    base_slug := left(base_slug, 30);
    counter := 0;
    final_slug := base_slug;
    WHILE EXISTS (SELECT 1 FROM public.tenants WHERE subdomain = final_slug AND id != t.id) LOOP
      counter := counter + 1;
      final_slug := base_slug || '-' || counter;
    END LOOP;
    UPDATE public.tenants SET subdomain = final_slug WHERE id = t.id;
  END LOOP;
END;
$$;

-- Public lookup function for domain resolution (no auth required)
CREATE OR REPLACE FUNCTION public.resolve_tenant_by_domain(p_hostname TEXT)
RETURNS TABLE(
  id UUID,
  name TEXT,
  agency_name TEXT,
  logo_url TEXT,
  primary_color TEXT,
  subdomain TEXT,
  custom_domain TEXT,
  domain_verified BOOLEAN,
  plan TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    t.id, t.name, t.agency_name, t.logo_url, t.primary_color,
    t.subdomain, t.custom_domain, t.domain_verified,
    s.plan
  FROM public.tenants t
  LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
  WHERE
    (t.custom_domain = p_hostname AND t.domain_verified = true)
    OR t.subdomain = split_part(p_hostname, '.', 1)
  LIMIT 1;
$$;
