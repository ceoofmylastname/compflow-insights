-- Positions FK Foundation
--
-- Establishes position_id FK columns on agent_position_history, commission_levels,
-- and commission_rate_adjustments. Backfills from existing TEXT data. Adds helper
-- view + function for time-stamped position lookups. TEXT columns are PRESERVED
-- in this migration so existing UI continues to work; a follow-up migration
-- (drop_position_text_columns) will remove them once all callers are cut over.

-- ============================================================================
-- A. Add nullable FK columns
-- ============================================================================

ALTER TABLE public.agent_position_history
  ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES public.positions(id);

ALTER TABLE public.commission_levels
  ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES public.positions(id);

ALTER TABLE public.commission_rate_adjustments
  ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES public.positions(id);

-- ============================================================================
-- B. Seed positions table with distinct text values per tenant
-- ============================================================================

INSERT INTO public.positions (tenant_id, title, priority)
SELECT tenant_id, position_text, 0
FROM (
  SELECT DISTINCT tenant_id, position AS position_text
    FROM public.agents
    WHERE position IS NOT NULL AND TRIM(position) <> ''
  UNION
  SELECT DISTINCT tenant_id, position_title AS position_text
    FROM public.agent_position_history
    WHERE position_title IS NOT NULL AND TRIM(position_title) <> ''
  UNION
  SELECT DISTINCT tenant_id, position AS position_text
    FROM public.commission_levels
    WHERE position IS NOT NULL AND TRIM(position) <> ''
  UNION
  SELECT DISTINCT tenant_id, position AS position_text
    FROM public.commission_rate_adjustments
    WHERE position IS NOT NULL AND TRIM(position) <> ''
) distinct_positions
ON CONFLICT (tenant_id, title) DO NOTHING;

-- ============================================================================
-- C. Backfill FK columns from existing TEXT
-- ============================================================================

UPDATE public.agent_position_history h
   SET position_id = p.id
  FROM public.positions p
 WHERE h.position_id IS NULL
   AND h.tenant_id = p.tenant_id
   AND h.position_title = p.title;

UPDATE public.commission_levels cl
   SET position_id = p.id
  FROM public.positions p
 WHERE cl.position_id IS NULL
   AND cl.tenant_id = p.tenant_id
   AND cl.position = p.title;

UPDATE public.commission_rate_adjustments ra
   SET position_id = p.id
  FROM public.positions p
 WHERE ra.position_id IS NULL
   AND ra.tenant_id = p.tenant_id
   AND ra.position = p.title;

-- ============================================================================
-- D. Ensure every agent with a position TEXT has an open history row
--    (current state requirement: there must be exactly one row per agent
--    where end_date IS NULL pointing to their current position)
-- ============================================================================

INSERT INTO public.agent_position_history (tenant_id, agent_id, position_id, position_title, upline_email, start_date)
SELECT
  a.tenant_id,
  a.id,
  p.id,
  a.position,
  a.upline_email,
  COALESCE(a.start_date, CURRENT_DATE)
FROM public.agents a
JOIN public.positions p
  ON p.tenant_id = a.tenant_id
 AND p.title = a.position
WHERE a.position IS NOT NULL
  AND TRIM(a.position) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_position_history h
     WHERE h.agent_id = a.id
       AND h.end_date IS NULL
  );

-- ============================================================================
-- E. NOT NULL + indexes on FK columns (only on tables where every row should
--    have a position; agent_position_history kept nullable to allow legacy
--    history rows that pre-date this migration to remain queryable)
-- ============================================================================

-- commission_levels: every rate must be tied to a position
ALTER TABLE public.commission_levels
  ALTER COLUMN position_id SET NOT NULL;

-- commission_rate_adjustments: same
ALTER TABLE public.commission_rate_adjustments
  ALTER COLUMN position_id SET NOT NULL;

-- agent_position_history.position_id is NOT NULL going forward, but we leave
-- the column nullable for now. Any history rows that couldn't be backfilled
-- (e.g. orphan position_title with no matching positions row) stay queryable.
-- The follow-up drop migration will set NOT NULL after we verify zero nulls.

CREATE INDEX IF NOT EXISTS idx_agent_position_history_position_id
  ON public.agent_position_history(position_id);

CREATE INDEX IF NOT EXISTS idx_agent_position_history_agent_open
  ON public.agent_position_history(agent_id)
  WHERE end_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_commission_levels_position_id
  ON public.commission_levels(position_id);

CREATE INDEX IF NOT EXISTS idx_commission_levels_lookup
  ON public.commission_levels(tenant_id, carrier, product, position_id, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_commission_rate_adjustments_position_id
  ON public.commission_rate_adjustments(position_id);

-- ============================================================================
-- F. Replace position-TEXT-keyed unique constraint on rate adjustments
-- ============================================================================

DO $$
DECLARE
  cn TEXT;
BEGIN
  FOR cn IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.commission_rate_adjustments'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) LIKE '%position%'
       AND pg_get_constraintdef(oid) NOT LIKE '%position_id%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.commission_rate_adjustments DROP CONSTRAINT %I',
      cn
    );
  END LOOP;
END$$;

ALTER TABLE public.commission_rate_adjustments
  ADD CONSTRAINT commission_rate_adjustments_unique_position_id
  UNIQUE (tenant_id, carrier, product, position_id, start_date);

-- ============================================================================
-- G. Helper view: each agent's CURRENT (open) position
-- ============================================================================

CREATE OR REPLACE VIEW public.agent_current_positions AS
SELECT
  h.agent_id,
  h.tenant_id,
  h.position_id,
  p.title    AS position_title,
  p.priority AS position_priority,
  h.upline_email,
  h.start_date
FROM public.agent_position_history h
JOIN public.positions p ON p.id = h.position_id
WHERE h.end_date IS NULL;

-- ============================================================================
-- H. Helper function: agent's position at a given date (time-stamped lookup)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_agent_position_at(
  _agent_id UUID,
  _at_date DATE
) RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT position_id
    FROM public.agent_position_history
   WHERE agent_id = _agent_id
     AND start_date <= _at_date
     AND (end_date IS NULL OR end_date >= _at_date)
     AND position_id IS NOT NULL
   ORDER BY start_date DESC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_agent_position_at(UUID, DATE) TO authenticated;

-- ============================================================================
-- I. RLS for the helper view (inherits from underlying tables but be explicit)
-- ============================================================================

GRANT SELECT ON public.agent_current_positions TO authenticated;

-- ============================================================================
-- Done. After applying:
--  1. Run: supabase gen types typescript --project-id iqxcjayylqvertwznyze > src/integrations/supabase/types.ts
--  2. Pull updated commission-engine.ts, useCommissionLevels.ts, useRateAdjustments.ts, etc.
--  3. Verify smoke test: open Commission Levels page, add a rate, confirm it persists with position_id.
-- ============================================================================
