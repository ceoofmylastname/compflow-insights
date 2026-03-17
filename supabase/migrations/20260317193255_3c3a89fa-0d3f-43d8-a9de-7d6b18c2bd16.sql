
-- Add missing columns to agents
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Add missing columns to tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS agency_name text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS primary_color text;

-- Add missing columns to policies
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS chargeback_risk boolean NOT NULL DEFAULT false;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS client_dob text;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS client_phone text;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS effective_date date;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS lead_source text;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS refs_collected integer NOT NULL DEFAULT 0;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS refs_sold integer NOT NULL DEFAULT 0;

-- Create flag_chargeback_risk function
CREATE OR REPLACE FUNCTION public.flag_chargeback_risk()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.policies
  SET chargeback_risk = true
  WHERE status = 'Pending'
    AND application_date IS NOT NULL
    AND application_date < CURRENT_DATE - INTERVAL '30 days'
    AND chargeback_risk = false;
$$;
