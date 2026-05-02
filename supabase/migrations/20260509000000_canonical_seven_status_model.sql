-- Canonical seven-status policy model.
--
-- Per Wiki/schema-spec.md (Canonical policy status model) and
-- Wiki/ui-design-system.md (Status colors), the canonical enum becomes:
--   Draft, Submitted, Pending, Issued, Issue Paid, Terminated, Potential Lapse
--
-- The split between Issued (carrier approved, agent not paid yet) and
-- Issue Paid (agent has been paid) is the foundation for the entire
-- money-tracking experience. Dashboards, payroll, leaderboards,
-- webhooks, commissions, colors, and carrier mappings all branch on
-- this enum.
--
-- Active is kept temporarily as a deprecated value during the migration
-- window so half-deployed tenants don't break. A follow-up PR drops it
-- after one full billing cycle.

-- ============================================================================
-- 1. Enum constraint update
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_policy_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS NOT NULL AND NEW.status NOT IN (
    'Draft', 'Submitted', 'Pending', 'Issued', 'Issue Paid',
    'Active',                  -- deprecated; back-compat for half-deployed tenants
    'Terminated', 'Potential Lapse'
  ) THEN
    RAISE EXCEPTION 'Invalid policy status. Must be Draft, Submitted, Pending, Issued, Issue Paid, Terminated, or Potential Lapse';
  END IF;
  IF NEW.contract_type IS NOT NULL AND NEW.contract_type NOT IN ('Direct Pay', 'LOA') THEN
    RAISE EXCEPTION 'Invalid contract_type. Must be Direct Pay or LOA';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================================
-- 2. commission_payouts: payment_status + paid_at columns
-- ============================================================================
--
-- Per Wiki/comp-grid-engine.md, commission rows now carry their payment
-- lifecycle independently of the policy status. The engine writes them
-- as 'pending' on Issued and flips them to 'paid' (with paid_at) on
-- Issue Paid. Payroll runs filter on 'paid' only.

ALTER TABLE public.commission_payouts
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'reversed')),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- ============================================================================
-- 3. policy_status_history (append-only audit of every transition)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.policy_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_id   UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'app',
  changed_by  UUID,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policy_status_history_policy
  ON public.policy_status_history(policy_id, changed_at DESC);

ALTER TABLE public.policy_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_status_history_select ON public.policy_status_history;
CREATE POLICY policy_status_history_select
  ON public.policy_status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.tenant_id = policy_status_history.tenant_id
        AND a.auth_user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. Data migration: split existing 'Active' rows into Issued vs Issue Paid
-- ============================================================================
--
-- Rule per the prompt: rows with status='Active' AND any commission row
-- already paid (commission_payouts rows exist for the policy) -> Issue
-- Paid. Rows with no commission rows yet -> Issued. Every transition
-- gets a policy_status_history row tagged source='migration' so audit
-- consumers see the canonical history.

WITH paid_policies AS (
  SELECT DISTINCT p.id, p.tenant_id, p.status AS old_status
  FROM public.policies p
  WHERE p.status = 'Active'
    AND EXISTS (SELECT 1 FROM public.commission_payouts c WHERE c.policy_id = p.id)
)
INSERT INTO public.policy_status_history (tenant_id, policy_id, from_status, to_status, source)
SELECT tenant_id, id, old_status, 'Issue Paid', 'migration' FROM paid_policies;

UPDATE public.policies p
SET status = 'Issue Paid'
WHERE p.status = 'Active'
  AND EXISTS (SELECT 1 FROM public.commission_payouts c WHERE c.policy_id = p.id);

WITH unpaid_policies AS (
  SELECT p.id, p.tenant_id, p.status AS old_status
  FROM public.policies p
  WHERE p.status = 'Active'
)
INSERT INTO public.policy_status_history (tenant_id, policy_id, from_status, to_status, source)
SELECT tenant_id, id, old_status, 'Issued', 'migration' FROM unpaid_policies;

UPDATE public.policies p
SET status = 'Issued'
WHERE p.status = 'Active';

-- ============================================================================
-- 5. Sync commission_payouts.payment_status to the new policy state
-- ============================================================================

UPDATE public.commission_payouts c
SET payment_status = 'paid',
    paid_at        = COALESCE(c.paid_at, c.calculated_at, now())
FROM public.policies p
WHERE c.policy_id = p.id
  AND p.status = 'Issue Paid'
  AND c.payment_status <> 'paid';

UPDATE public.commission_payouts c
SET payment_status = 'pending',
    paid_at        = NULL
FROM public.policies p
WHERE c.policy_id = p.id
  AND p.status = 'Issued'
  AND c.payment_status NOT IN ('paid', 'reversed');

-- ============================================================================
-- 6. Carrier-status mapping seed: re-backfill with the seven-status model
-- ============================================================================
--
-- Refreshes carrier_profiles.status_value_map for every existing row.
-- Replaces the prior six-status defaults that mapped "Issued" / "Issue
-- Paid" / etc. all into "Active". The new mapping splits them per the
-- prompt and adds "Paid" -> "Issue Paid".
--
-- Strategy: completely rewrite the map for any row whose current map
-- is the legacy default (every value is "Active"-or-other-old-canonical).
-- Hand-edited per-carrier maps that already contain Issued/Issue Paid
-- entries are left alone.

UPDATE public.carrier_profiles
SET status_value_map = '{
  "Issued": "Issued",
  "Issue Paid": "Issue Paid",
  "Issued Paid": "Issue Paid",
  "First Year Paid": "Issue Paid",
  "Paid": "Issue Paid",
  "Inforce": "Issued",
  "In Force": "Issued",
  "Active": "Issued",
  "Submitted": "Submitted",
  "App Submitted": "Submitted",
  "Application Submitted": "Submitted",
  "Pending": "Pending",
  "Pending Underwriting": "Pending",
  "Pending Issue": "Pending",
  "Underwriting": "Pending",
  "Approved": "Pending",
  "Free Look": "Pending",
  "Draft": "Draft",
  "Saved": "Draft",
  "Terminated": "Terminated",
  "Lapsed": "Terminated",
  "Cancelled": "Terminated",
  "Canceled": "Terminated",
  "Surrendered": "Terminated",
  "NTO": "Terminated",
  "Not Taken": "Terminated",
  "Declined": "Terminated",
  "Withdrawn": "Terminated",
  "Potential Lapse": "Potential Lapse",
  "Past Due": "Potential Lapse",
  "Grace Period": "Potential Lapse"
}'::jsonb
WHERE status_value_map IS NULL
   OR status_value_map = '{}'::jsonb
   OR (status_value_map ->> 'Issued') = 'Active'
   OR (status_value_map ->> 'Issue Paid') = 'Active';

-- ============================================================================
-- 7. update_carrier_status_mapping: accept the seven canonical values
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_carrier_status_mapping(
  p_carrier_name    TEXT,
  p_raw_value       TEXT,
  p_canonical_value TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_is_owner  BOOLEAN;
  v_clean_raw TEXT;
BEGIN
  IF p_carrier_name IS NULL OR length(trim(p_carrier_name)) = 0 THEN
    RAISE EXCEPTION 'carrier_name is required';
  END IF;
  IF p_raw_value IS NULL OR length(trim(p_raw_value)) = 0 THEN
    RAISE EXCEPTION 'raw_value is required';
  END IF;
  IF p_canonical_value NOT IN (
    'Draft', 'Submitted', 'Pending', 'Issued', 'Issue Paid', 'Terminated', 'Potential Lapse'
  ) THEN
    RAISE EXCEPTION 'canonical_value must be one of: Draft, Submitted, Pending, Issued, Issue Paid, Terminated, Potential Lapse';
  END IF;

  SELECT a.tenant_id, a.is_owner
  INTO   v_tenant_id, v_is_owner
  FROM   public.agents a
  WHERE  a.auth_user_id = auth.uid()
  LIMIT  1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_is_owner IS NOT TRUE THEN
    RAISE EXCEPTION 'Owner access required';
  END IF;

  v_clean_raw := trim(p_raw_value);

  IF NOT EXISTS (
    SELECT 1 FROM public.carrier_profiles
    WHERE tenant_id = v_tenant_id AND lower(carrier_name) = lower(trim(p_carrier_name))
  ) THEN
    INSERT INTO public.carrier_profiles (tenant_id, carrier_name, column_mappings, custom_fields, status_value_map)
    VALUES (v_tenant_id, trim(p_carrier_name), '{}'::jsonb, '[]'::jsonb,
            jsonb_build_object(v_clean_raw, p_canonical_value));
  ELSE
    UPDATE public.carrier_profiles
    SET status_value_map = COALESCE(status_value_map, '{}'::jsonb) ||
                           jsonb_build_object(v_clean_raw, p_canonical_value),
        updated_at = now()
    WHERE tenant_id = v_tenant_id AND lower(carrier_name) = lower(trim(p_carrier_name));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_carrier_status_mapping(TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 8. Verification
-- ============================================================================
-- After paste, run:
--
--   SELECT
--     EXISTS (SELECT 1 FROM information_schema.columns
--             WHERE table_schema='public' AND table_name='commission_payouts'
--               AND column_name='payment_status')                        AS has_payment_status,
--     EXISTS (SELECT 1 FROM information_schema.columns
--             WHERE table_schema='public' AND table_name='commission_payouts'
--               AND column_name='paid_at')                               AS has_paid_at,
--     EXISTS (SELECT 1 FROM information_schema.tables
--             WHERE table_schema='public' AND table_name='policy_status_history') AS has_history,
--     (SELECT count(*) FROM public.policies WHERE status = 'Active')     AS remaining_active,
--     (SELECT count(*) FROM public.policies WHERE status = 'Issued')     AS issued_count,
--     (SELECT count(*) FROM public.policies WHERE status = 'Issue Paid') AS issue_paid_count;
--
-- remaining_active should be 0. has_* flags should all be true.
