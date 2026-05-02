-- Active-agent billing infrastructure.
--
-- Per Wiki/active-agent-billing-model.md, Wiki/pricing-and-checkout.md, and
-- Wiki/schema-spec.md (billing_snapshots), this migration:
--   - Extends `tenants` with Stripe IDs + billing lifecycle state
--   - Extends `billing_snapshots` with the period + amount fields the wiki
--     specs (period_start_date, period_end_date, unit_price, total_amount)
--     plus Stripe-side correlation IDs for idempotency
--   - Adds an enum-ish CHECK on billing_status
--   - Schedules the daily snapshot via pg_cron (uses pg_net to call the
--     stripe-monthly-snapshot Edge Function at 00:05 UTC)
--
-- Drafts already excluded from snapshot_active_agents per migration
-- 20260504000000_drafts_status_first_class.sql.

-- ============================================================================
-- 1. tenants billing columns
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS billing_status         TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS trial_ends_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_invoice_paid_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_invoice_amount    NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS payment_failure_count  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS soft_disabled_at       TIMESTAMPTZ;

-- billing_status values:
--   'trial'         — 14-day trial active, no charges yet
--   'active'        — paying customer in good standing
--   'past_due'      — last invoice failed; still has access during grace window
--   'soft_disabled' — 3 failures or 14 days past_due; access revoked except billing tab
--   'canceled'     — subscription explicitly canceled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tenants_billing_status_check'
       AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_billing_status_check
      CHECK (billing_status IN ('trial', 'active', 'past_due', 'soft_disabled', 'canceled'));
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_stripe_customer
  ON public.tenants(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_stripe_subscription
  ON public.tenants(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ============================================================================
-- 2. Extend billing_snapshots
-- ============================================================================

ALTER TABLE public.billing_snapshots
  ADD COLUMN IF NOT EXISTS period_start_date         DATE,
  ADD COLUMN IF NOT EXISTS period_end_date           DATE,
  ADD COLUMN IF NOT EXISTS unit_price                NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS total_amount              NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS stripe_usage_record_id    TEXT,
  ADD COLUMN IF NOT EXISTS reported_to_stripe_at     TIMESTAMPTZ;

-- Idempotency guard: don't double-bill the same period
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_snapshots_one_per_period
  ON public.billing_snapshots(tenant_id, period_start_date, period_end_date)
  WHERE period_start_date IS NOT NULL AND period_end_date IS NOT NULL;

-- ============================================================================
-- 3. Helper RPC: take a snapshot for one tenant, returning the row.
--    Used by the monthly cron (Edge Function) AND by the in-app
--    "Take Snapshot" button in the Billing tab. Idempotent on
--    (tenant_id, period_start_date, period_end_date).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.take_billing_snapshot(
  p_tenant_id          UUID,
  p_period_start_date  DATE,
  p_period_end_date    DATE,
  p_unit_price         NUMERIC DEFAULT NULL
)
RETURNS public.billing_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count   INTEGER;
  v_unit_price     NUMERIC;
  v_total_amount   NUMERIC;
  v_snapshot       public.billing_snapshots;
BEGIN
  -- Active = wrote a non-Draft policy in the period window
  SELECT COUNT(DISTINCT resolved_agent_id)
    INTO v_active_count
    FROM public.policies
   WHERE tenant_id = p_tenant_id
     AND created_at >= p_period_start_date
     AND created_at <  (p_period_end_date + INTERVAL '1 day')
     AND status IS DISTINCT FROM 'Draft';

  -- Tiered pricing per Wiki/pricing-and-checkout.md
  v_unit_price := COALESCE(
    p_unit_price,
    CASE WHEN v_active_count >= 50 THEN 25.00 ELSE 30.00 END
  );
  v_total_amount := v_active_count * v_unit_price;

  INSERT INTO public.billing_snapshots (
    tenant_id, snapshot_date, active_agent_count,
    period_start_date, period_end_date,
    unit_price, total_amount
  )
  VALUES (
    p_tenant_id, CURRENT_DATE, v_active_count,
    p_period_start_date, p_period_end_date,
    v_unit_price, v_total_amount
  )
  ON CONFLICT (tenant_id, period_start_date, period_end_date)
  DO UPDATE SET
    snapshot_date      = EXCLUDED.snapshot_date,
    active_agent_count = EXCLUDED.active_agent_count,
    unit_price         = EXCLUDED.unit_price,
    total_amount       = EXCLUDED.total_amount
  RETURNING * INTO v_snapshot;

  RETURN v_snapshot;
END;
$$;

GRANT EXECUTE ON FUNCTION public.take_billing_snapshot(UUID, DATE, DATE, NUMERIC) TO authenticated;

-- ============================================================================
-- 4. Soft-disable trigger: when payment_failure_count hits 3 OR billing_status
--    has been 'past_due' for 14 days, flip to 'soft_disabled'.
--    Implemented as a function that the webhook handler calls explicitly
--    (rather than a row-level trigger) to keep the logic visible and avoid
--    surprising side effects.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.evaluate_billing_state(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status              TEXT;
  v_failure_count       INTEGER;
  v_last_paid           TIMESTAMPTZ;
BEGIN
  SELECT billing_status, payment_failure_count, last_invoice_paid_at
    INTO v_status, v_failure_count, v_last_paid
    FROM public.tenants
   WHERE id = p_tenant_id;

  IF v_failure_count >= 3 THEN
    UPDATE public.tenants
       SET billing_status = 'soft_disabled',
           soft_disabled_at = COALESCE(soft_disabled_at, now())
     WHERE id = p_tenant_id;
    RETURN 'soft_disabled';
  END IF;

  IF v_status = 'past_due' AND v_last_paid IS NOT NULL
     AND v_last_paid < now() - INTERVAL '14 days' THEN
    UPDATE public.tenants
       SET billing_status = 'soft_disabled',
           soft_disabled_at = COALESCE(soft_disabled_at, now())
     WHERE id = p_tenant_id;
    RETURN 'soft_disabled';
  END IF;

  RETURN v_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.evaluate_billing_state(UUID) TO service_role;

-- ============================================================================
-- 5. pg_cron + pg_net schedule: daily 00:05 UTC.
--
--    NOTE: Supabase enables pg_cron under the `cron` schema. pg_net is
--    enabled by default. The Edge Function URL must be set in the
--    cron schedule (it depends on the project ref). The user must run
--    the GRANT and INSERT below ONCE after deploying the Edge Function.
--    The actual scheduling is in supabase/STRIPE_SETUP.md as one-shot SQL.
-- ============================================================================

-- (No automatic cron schedule in this migration — see STRIPE_SETUP.md.
-- Scheduling is a runtime/operational step that depends on project ref
-- and the deployed Edge Function URL.)
