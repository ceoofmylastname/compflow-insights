-- Tier billing model.
--
-- Per Wiki/pricing-and-checkout.md (final lock 2026-05-01):
--   Starter    $97/mo  flat,  3-agent cap
--   Growth     $297/mo flat, 10-agent cap
--   Pro        $497/mo flat, 50-agent cap
--   Enterprise         metered (active agent), no agent cap
--
-- Plus add-ons (line items on Growth/Pro/Enterprise only):
--   White-Label Add-On      $97/mo flat
--   Additional Vanity Domain $25/mo flat per domain
--
-- The previous (active-agent-metered for everyone + $497 setup fee) model
-- is dropped per the new spec. The setup fee Stripe price stops being used;
-- this migration does not delete prior `tenants` columns from migration
-- 20260505000000 because they remain valid (stripe_customer_id, etc.).

-- ============================================================================
-- 1. Tier columns on tenants
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS current_plan_tier         TEXT,
  ADD COLUMN IF NOT EXISTS agent_cap                 INTEGER,
  ADD COLUMN IF NOT EXISTS white_label_addon_active  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_in_trial               BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tenants_plan_tier_check'
       AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_plan_tier_check
      CHECK (current_plan_tier IS NULL
          OR current_plan_tier IN ('starter', 'growth', 'pro', 'enterprise'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_tenants_plan_tier
  ON public.tenants(current_plan_tier);

-- ============================================================================
-- 2. Helper: cap implied by tier (single source of truth)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.agent_cap_for_tier(p_tier TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE p_tier
    WHEN 'starter'    THEN 3
    WHEN 'growth'     THEN 10
    WHEN 'pro'        THEN 50
    WHEN 'enterprise' THEN NULL  -- unlimited
    ELSE NULL
  END;
END;
$$;

-- ============================================================================
-- 3. Trigger: enforce agent cap on INSERT into agents.
--    Counts non-archived non-owner rows. NULL cap = no limit (Enterprise).
--    The owner record is not counted toward the cap (they're the buyer,
--    not a contracted agent).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_agent_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cap   INTEGER;
  v_count INTEGER;
  v_tier  TEXT;
BEGIN
  -- Owner rows always pass — they're created during signup.
  IF NEW.is_owner = true THEN RETURN NEW; END IF;

  SELECT agent_cap, current_plan_tier
    INTO v_cap, v_tier
    FROM public.tenants
   WHERE id = NEW.tenant_id;

  IF v_cap IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*)
    INTO v_count
    FROM public.agents
   WHERE tenant_id = NEW.tenant_id
     AND is_archived IS NOT TRUE
     AND is_owner IS NOT TRUE;

  IF v_count >= v_cap THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Agent cap reached for current plan tier (%s, cap=%s). Upgrade to add more agents.',
        COALESCE(v_tier, 'unknown'), v_cap
      ),
      ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_agent_cap ON public.agents;

CREATE TRIGGER trg_enforce_agent_cap
  BEFORE INSERT ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agent_cap();

-- ============================================================================
-- 4. RPC for the in-app cap-status read (used by InviteAgentModal pre-check
--    and the home page 90% warning banner).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tenant_agent_cap_status(p_tenant_id UUID)
RETURNS TABLE (
  tier        TEXT,
  cap         INTEGER,
  current     INTEGER,
  remaining   INTEGER,
  pct_used    NUMERIC,
  near_cap    BOOLEAN,
  at_cap      BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier  TEXT;
  v_cap   INTEGER;
  v_curr  INTEGER;
BEGIN
  SELECT current_plan_tier, agent_cap
    INTO v_tier, v_cap
    FROM public.tenants
   WHERE id = p_tenant_id;

  SELECT COUNT(*)
    INTO v_curr
    FROM public.agents
   WHERE tenant_id = p_tenant_id
     AND is_archived IS NOT TRUE
     AND is_owner IS NOT TRUE;

  RETURN QUERY SELECT
    v_tier,
    v_cap,
    v_curr,
    CASE WHEN v_cap IS NULL THEN NULL ELSE GREATEST(0, v_cap - v_curr) END,
    CASE WHEN v_cap IS NULL OR v_cap = 0 THEN 0::NUMERIC
         ELSE ROUND((v_curr::NUMERIC / v_cap::NUMERIC) * 100, 1)
    END,
    CASE WHEN v_cap IS NULL THEN false
         ELSE (v_curr::NUMERIC / v_cap::NUMERIC) >= 0.9
    END,
    CASE WHEN v_cap IS NULL THEN false
         ELSE v_curr >= v_cap
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tenant_agent_cap_status(UUID) TO authenticated;

-- ============================================================================
-- 5. Update stripe-monthly-snapshot's downstream RPC to skip non-Enterprise
--    tenants. take_billing_snapshot from migration 20260505 still applies for
--    Enterprise; the Edge Function caller is responsible for skipping flat
--    tiers (cleaner than baking the tier check into the RPC, which the
--    in-app "Take Snapshot" button can still call for Enterprise tenants
--    that want a manual preview).
-- ============================================================================

-- (No changes to take_billing_snapshot — caller-side branching.)
