ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS billing_interval text,
  ADD COLUMN IF NOT EXISTS modal_premium numeric;