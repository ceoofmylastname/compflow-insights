-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule flag_chargeback_risk to run every day at 6am UTC
SELECT cron.schedule(
  'daily-chargeback-flag',
  '0 6 * * *',
  $$SELECT public.flag_chargeback_risk()$$
);

CREATE OR REPLACE FUNCTION public.flag_chargeback_risk()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.policies
  SET chargeback_risk = true
  WHERE status IN ('Pending', 'Submitted')
    AND application_date IS NOT NULL
    AND application_date < CURRENT_DATE - INTERVAL '30 days'
    AND chargeback_risk = false;
$$;
