-- Task 2: Add missing policy fields
ALTER TABLE public.policies
ADD COLUMN IF NOT EXISTS client_phone TEXT,
ADD COLUMN IF NOT EXISTS client_dob DATE,
ADD COLUMN IF NOT EXISTS lead_source TEXT;

-- Task 3: Add chargeback risk flag
ALTER TABLE public.policies
ADD COLUMN IF NOT EXISTS chargeback_risk BOOLEAN DEFAULT false;

-- Task 3: Function to flag chargeback risk
CREATE OR REPLACE FUNCTION public.flag_chargeback_risk()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.policies
  SET chargeback_risk = true
  WHERE status = 'Pending'
    AND created_at < now() - interval '30 days'
    AND chargeback_risk = false;
END;
$$;
