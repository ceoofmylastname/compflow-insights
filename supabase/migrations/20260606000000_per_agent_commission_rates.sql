-- Per-agent commission rate override per Wiki/comp-grid-engine.md
-- ("Per-agent rate overrides" section, 2026-05-02) and
-- Wiki/schema-spec.md.
--
-- Goal: agents in the same position can carry different rates because
-- real-world insurance contracts work that way. Rate range 50-130% in
-- 5% increments. Owner-managed only; agents have read-only view.
-- Position-based comp grid stays as the fallback — the engine resolves
-- agent-first then walks back to commission_levels for the agent's
-- position when no override exists.
--
-- Path A: matches the live schema's TEXT carrier/product columns
-- (commission_levels and policies both use TEXT). The carrier_id FK
-- migration is a separate ship.

-- ============================================================================
-- 1. agent_carrier_rates
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_carrier_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  carrier         TEXT NOT NULL,
  product         TEXT,
  rate            NUMERIC(4,2) NOT NULL,
  start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date        DATE,
  set_by_user_id  UUID REFERENCES public.agents(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rate_in_range_5pct
    CHECK (rate >= 0.50 AND rate <= 1.30 AND mod((rate * 100)::int, 5) = 0)
);

-- Unique on the active key. COALESCE collapses NULL product to ''
-- so two rows for the same (agent, carrier, NULL product, start_date)
-- collide as expected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_carrier_rates_unique_active
  ON public.agent_carrier_rates (tenant_id, agent_id, carrier, COALESCE(product, ''), start_date);

CREATE INDEX IF NOT EXISTS idx_agent_carrier_rates_lookup
  ON public.agent_carrier_rates (tenant_id, agent_id, carrier, product, start_date, end_date);

-- updated_at trigger so audit timestamps reflect every UPDATE.
CREATE OR REPLACE FUNCTION public.touch_agent_carrier_rates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_agent_carrier_rates ON public.agent_carrier_rates;
CREATE TRIGGER trg_touch_agent_carrier_rates
  BEFORE UPDATE ON public.agent_carrier_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_agent_carrier_rates_updated_at();

-- ============================================================================
-- 2. RLS
-- ============================================================================
--
-- Read: agent sees their own rates; owners and managers see
-- everything in tenant. Per the user directive 2026-05-02 agents are
-- read-only — write policies are owner-or-manager only. Helper
-- functions current_agent_id() and is_owner_or_manager() are defined
-- in 20260604000000_agent_contracts_self_insert_rls.sql.

ALTER TABLE public.agent_carrier_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_carrier_rates_select ON public.agent_carrier_rates;
CREATE POLICY agent_carrier_rates_select
  ON public.agent_carrier_rates FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_current_agent_tenant_id()
    AND (
      agent_id = public.current_agent_id()
      OR public.is_owner_or_manager()
    )
  );

DROP POLICY IF EXISTS agent_carrier_rates_insert ON public.agent_carrier_rates;
CREATE POLICY agent_carrier_rates_insert
  ON public.agent_carrier_rates FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_agent_tenant_id()
    AND public.is_owner_or_manager()
  );

DROP POLICY IF EXISTS agent_carrier_rates_update ON public.agent_carrier_rates;
CREATE POLICY agent_carrier_rates_update
  ON public.agent_carrier_rates FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_current_agent_tenant_id()
    AND public.is_owner_or_manager()
  )
  WITH CHECK (
    tenant_id = public.get_current_agent_tenant_id()
    AND public.is_owner_or_manager()
  );

DROP POLICY IF EXISTS agent_carrier_rates_delete ON public.agent_carrier_rates;
CREATE POLICY agent_carrier_rates_delete
  ON public.agent_carrier_rates FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_current_agent_tenant_id()
    AND public.is_owner_or_manager()
  );

-- ============================================================================
-- 3. Realtime publication
-- ============================================================================
--
-- Same idempotent pattern shipped for carriers (20260603000000) and
-- policies (20260605000000). Owner-driven rate edits propagate live
-- across owner sessions and to the agent's "My Rates" view.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'agent_carrier_rates'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_carrier_rates';
  END IF;
END;
$$;

ALTER TABLE public.agent_carrier_rates REPLICA IDENTITY FULL;

-- ============================================================================
-- 4. Verification (run manually after migrate)
-- ============================================================================
--   SELECT
--     to_regclass('public.agent_carrier_rates') IS NOT NULL                   AS has_table,
--     EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rate_in_range_5pct') AS has_check_constraint,
--     EXISTS (SELECT 1 FROM pg_indexes
--              WHERE schemaname='public'
--                AND indexname='idx_agent_carrier_rates_unique_active')       AS has_unique_index,
--     (SELECT COUNT(*) FROM pg_policy
--        WHERE polrelid='public.agent_carrier_rates'::regclass)               AS rls_policy_count,
--     EXISTS (SELECT 1 FROM pg_publication_tables
--              WHERE pubname='supabase_realtime'
--                AND schemaname='public'
--                AND tablename='agent_carrier_rates')                         AS in_publication;
--   -- Expect: has_table=true, has_check=true, has_unique_index=true,
--   --         rls_policy_count=4, in_publication=true.
