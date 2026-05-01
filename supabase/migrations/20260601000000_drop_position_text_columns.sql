-- DROP TEXT POSITION COLUMNS — Stage 2 cleanup of the FK foundation migration.
--
-- DO NOT APPLY THIS until every UI surface that reads or writes one of these
-- columns has been cut over to the FK columns:
--
--   - agents.position                       (read by AgentRoster, useCommissionPayouts, OrgTree, Scoreboard, useScoreboardData, edge fns)
--   - agent_position_history.position_title (synthesized in InviteAgentModal; tracked by future onboarding flows)
--   - commission_levels.position            (read in search filter on CommissionLevels page; written by CSV import)
--   - commission_rate_adjustments.position  (displayed in adjustments table; written by CSV import)
--
-- Cutover checklist before applying this migration:
--   [ ] AgentRoster.tsx reads position from agent_current_positions view
--   [ ] InviteAgentModal.tsx inserts agent_position_history row with position_id (no TEXT)
--   [ ] Onboarding.tsx / Signup.tsx create agent_position_history row on agent creation
--   [ ] CSV import paths resolve position TEXT -> position_id (auto-create positions row)
--   [ ] useCommissionPayouts.ts joins to agent_current_positions for agent_position display
--   [ ] OrgTree.tsx, Scoreboard.tsx, useScoreboardData.ts use joined position
--   [ ] supabase/functions/get-platform-data/index.ts no longer SELECTs the dropped TEXT columns
--   [ ] The CommissionLevels search filter no longer references l.position
--   [ ] supabase gen types typescript ... has been re-run after applying this migration
--
-- After applying:
--   - The legacy "TEXT search by position" on CommissionLevels page will need a JOIN to positions.
--   - Any caller still referencing the dropped columns will throw at runtime.
-- ============================================================================

-- Pre-flight: verify every commission_levels and commission_rate_adjustments
-- row has position_id populated. Abort if not.
DO $$
DECLARE
  bad_rows INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad_rows
    FROM public.commission_levels
   WHERE position_id IS NULL;
  IF bad_rows > 0 THEN
    RAISE EXCEPTION 'ABORT: % commission_levels rows have NULL position_id. Backfill before dropping TEXT.', bad_rows;
  END IF;

  SELECT COUNT(*) INTO bad_rows
    FROM public.commission_rate_adjustments
   WHERE position_id IS NULL;
  IF bad_rows > 0 THEN
    RAISE EXCEPTION 'ABORT: % commission_rate_adjustments rows have NULL position_id.', bad_rows;
  END IF;
END$$;

-- Tighten agent_position_history: every row must have a position_id by now.
ALTER TABLE public.agent_position_history
  ALTER COLUMN position_id SET NOT NULL;

-- Drop TEXT columns
ALTER TABLE public.agents
  DROP COLUMN IF EXISTS position;

ALTER TABLE public.agent_position_history
  DROP COLUMN IF EXISTS position_title;

ALTER TABLE public.commission_levels
  DROP COLUMN IF EXISTS position;

ALTER TABLE public.commission_rate_adjustments
  DROP COLUMN IF EXISTS position;
