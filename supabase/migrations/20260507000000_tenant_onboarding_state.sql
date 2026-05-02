-- New-tenant onboarding wizard state.
--
-- Persists per-tenant wizard progress so an owner who bails mid-flow can
-- resume where they left off. The home page reads `step_completed` and
-- `completed_at` to decide whether to show the "Finish setting up Base
-- Shop HQ" banner. Ownership of completion is the tenant, not the user.
--
-- Also extends `tenants` with the agency-profile fields the wizard
-- collects up front (time zone, default currency, default annual goal).

-- ============================================================================
-- 1. Agency profile columns on tenants
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS time_zone           TEXT,
  ADD COLUMN IF NOT EXISTS default_currency    TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS default_annual_goal NUMERIC;

-- ============================================================================
-- 2. tenant_onboarding_state
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_onboarding_state (
  tenant_id      UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  step_completed INTEGER NOT NULL DEFAULT 0,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bookkeeping trigger: keep updated_at fresh.
CREATE OR REPLACE FUNCTION public.touch_tenant_onboarding_state()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_tenant_onboarding_state ON public.tenant_onboarding_state;
CREATE TRIGGER trg_touch_tenant_onboarding_state
  BEFORE UPDATE ON public.tenant_onboarding_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_tenant_onboarding_state();

-- ============================================================================
-- 3. RLS — only members of the tenant can read; only owners can write.
-- ============================================================================

ALTER TABLE public.tenant_onboarding_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_onboarding_state_select ON public.tenant_onboarding_state;
CREATE POLICY tenant_onboarding_state_select
  ON public.tenant_onboarding_state
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.tenant_id = tenant_onboarding_state.tenant_id
        AND a.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tenant_onboarding_state_insert ON public.tenant_onboarding_state;
CREATE POLICY tenant_onboarding_state_insert
  ON public.tenant_onboarding_state
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.tenant_id = tenant_onboarding_state.tenant_id
        AND a.auth_user_id = auth.uid()
        AND a.is_owner = true
    )
  );

DROP POLICY IF EXISTS tenant_onboarding_state_update ON public.tenant_onboarding_state;
CREATE POLICY tenant_onboarding_state_update
  ON public.tenant_onboarding_state
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.tenant_id = tenant_onboarding_state.tenant_id
        AND a.auth_user_id = auth.uid()
        AND a.is_owner = true
    )
  );

-- ============================================================================
-- 4. Seed an empty row for every existing tenant so the home-page banner
--    has a known state to read. Existing tenants are treated as "complete"
--    since they predate the wizard and shouldn't see the action banner.
-- ============================================================================

INSERT INTO public.tenant_onboarding_state (tenant_id, step_completed, completed_at)
SELECT id, 6, now()
FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- ============================================================================
-- 5. Verification
-- ============================================================================
-- After paste, run:
--
--   SELECT
--     EXISTS (SELECT 1 FROM information_schema.tables  WHERE table_schema='public' AND table_name='tenant_onboarding_state')      AS has_table,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='time_zone')           AS has_tz,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='default_currency')    AS has_ccy,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='default_annual_goal') AS has_goal;
--
-- All four should be true.
