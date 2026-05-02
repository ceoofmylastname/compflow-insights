-- Relax agent_position_history.position_id NOT NULL + backfill missing rows.
--
-- Migration B (drop_position_text_columns) tightened position_id to NOT NULL,
-- which inadvertently broke owner-driven upline reassignment for agents who
-- joined via signup paths that never inserted a position assignment. The row
-- also serves as the time-stamped source of truth for an agent's upline; an
-- upline-only reassignment is a valid event even when no position has been
-- assigned. commission_levels.position_id and commission_rate_adjustments
-- .position_id retain their NOT NULL — those tables can't function without
-- a position-keyed rate.

ALTER TABLE public.agent_position_history
  ALTER COLUMN position_id DROP NOT NULL;

-- Backfill: every non-archived agent without an open history row gets one
-- inserted from their denormalized state. Catches agents who joined via the
-- signup path that doesn't create a position assignment, and the tenant
-- owner who never had one to begin with.
INSERT INTO public.agent_position_history (
  tenant_id, agent_id, position_id, upline_email, start_date
)
SELECT
  a.tenant_id,
  a.id,
  NULL,
  a.upline_email,
  COALESCE(a.start_date, CURRENT_DATE)
FROM public.agents a
WHERE NOT EXISTS (
  SELECT 1 FROM public.agent_position_history h
   WHERE h.agent_id = a.id AND h.end_date IS NULL
)
AND a.is_archived IS NOT TRUE;
