-- Orphan auto-link mechanism per Wiki/carrier-ingest-pipeline.md and
-- Wiki/csv-upload-matching-and-routing.md (updated 2026-05-02).
--
-- Goal: a CSV row whose writing number is not yet in agent_contracts
-- should still import as an "orphan" (resolved_agent_id NULL,
-- agent_number populated). When the owner later adds the missing
-- writing number to the right agent's contracts, this trigger
-- auto-attaches every matching orphan in one shot.
--
-- Path A constraints (per the audit): the spec uses target column
-- names that don't exist yet in the live schema (carrier_id, agent_id,
-- updated_at, old_status/new_status). This migration adapts to the
-- live shape:
--   policies.carrier             (TEXT, not carrier_id UUID)
--   policies.resolved_agent_id   (not agent_id)
--   policies has no updated_at   (the trigger doesn't set it)
--   policy_status_history columns: from_status / to_status / changed_by
-- The user-visible behavior is identical; the FK rename is a separate
-- ship for after Prompt 7's white-label work.

-- ============================================================================
-- 1. policies.agent_number
-- ============================================================================
--
-- Denormalized copy of agent_contracts.agent_number for the row's
-- (tenant, carrier, agent). Lets the auto-link trigger find orphans
-- in O(1) via the partial index without re-walking agent_contracts.
-- For orphan rows, agent_number holds the writing_agent_id straight
-- from the CSV.

ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS agent_number TEXT;

-- Backfill: every existing assigned policy gets its agent_number
-- populated from agent_contracts. Where no contract exists for the
-- (tenant, carrier, agent) tuple, the column stays NULL — those are
-- pre-existing orphans we cannot retro-resolve here.
UPDATE public.policies p
   SET agent_number = ac.agent_number
  FROM public.agent_contracts ac
 WHERE p.resolved_agent_id IS NOT NULL
   AND p.tenant_id = ac.tenant_id
   AND p.carrier   = ac.carrier
   AND p.resolved_agent_id = ac.agent_id
   AND p.agent_number IS NULL;

-- Partial index on the orphan-lookup key. The trigger only ever
-- queries WHERE resolved_agent_id IS NULL, so a partial index on the
-- orphan subset keeps the index tiny and updates cheap.
CREATE INDEX IF NOT EXISTS idx_policies_orphan_lookup
  ON public.policies (tenant_id, carrier, agent_number)
  WHERE resolved_agent_id IS NULL;

-- ============================================================================
-- 2. auto_link_orphan_policies() trigger function
-- ============================================================================
--
-- AFTER INSERT or AFTER UPDATE OF agent_number on agent_contracts.
-- For each agent_contracts row that lands, find every orphan policy
-- in the same (tenant, carrier) with a matching agent_number and
-- attach it to NEW.agent_id. Writes one policy_status_history row per
-- attached policy with source='contract_added_backfill' so the audit
-- trail is preserved.
--
-- Idempotent: if an orphan no longer exists (or was already attached
-- to a different agent), the WHERE clause filters it out and the
-- UPDATE no-ops cleanly. Re-running on the same agent_contracts row
-- produces zero side effects.

CREATE OR REPLACE FUNCTION public.auto_link_orphan_policies()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attached_count INTEGER;
BEGIN
  -- Nothing to do when the contract has no writing number — there's
  -- no key to match orphans on.
  IF NEW.agent_number IS NULL OR NEW.agent_number = '' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only act when the agent_number actually changed.
  -- (CREATE TRIGGER ... OF agent_number filters this on the column
  -- list; the body guards against trigger-fires-on-other-column edge
  -- cases just in case the trigger gets broadened later.)
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.agent_number, '') = COALESCE(NEW.agent_number, '') THEN
    RETURN NEW;
  END IF;

  -- Forensic audit: snapshot every orphan we are about to attach.
  -- Insert BEFORE the UPDATE so the SELECT sees the pre-update state
  -- (resolved_agent_id IS NULL is the orphan signal).
  INSERT INTO public.policy_status_history
    (tenant_id, policy_id, from_status, to_status, source, changed_by)
  SELECT p.tenant_id, p.id, p.status, p.status, 'contract_added_backfill', NULL
    FROM public.policies p
   WHERE p.tenant_id    = NEW.tenant_id
     AND p.carrier      = NEW.carrier
     AND p.agent_number = NEW.agent_number
     AND p.resolved_agent_id IS NULL;

  -- Attach the orphans.
  UPDATE public.policies p
     SET resolved_agent_id = NEW.agent_id
   WHERE p.tenant_id    = NEW.tenant_id
     AND p.carrier      = NEW.carrier
     AND p.agent_number = NEW.agent_number
     AND p.resolved_agent_id IS NULL;

  GET DIAGNOSTICS v_attached_count = ROW_COUNT;
  -- v_attached_count is captured but not surfaced — the audit table
  -- is the durable record. RAISE NOTICE here would noise up logs on
  -- every contract insert.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_contracts_auto_link ON public.agent_contracts;
CREATE TRIGGER agent_contracts_auto_link
  AFTER INSERT OR UPDATE OF agent_number ON public.agent_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_orphan_policies();

-- ============================================================================
-- 3. Realtime publication
-- ============================================================================
--
-- Add policies to the supabase_realtime publication and set REPLICA
-- IDENTITY FULL so DELETE row events (bulk delete) AND UPDATE row
-- events (orphan auto-attach) surface to subscribers. This is the
-- same idempotent pattern shipped for carriers in
-- 20260603000000_carriers_realtime_publication.sql.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'policies'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.policies';
  END IF;
END;
$$;

ALTER TABLE public.policies REPLICA IDENTITY FULL;

-- ============================================================================
-- 4. Verification (run manually after migrate)
-- ============================================================================
--   SELECT
--     EXISTS (SELECT 1 FROM information_schema.columns
--              WHERE table_schema='public' AND table_name='policies'
--                AND column_name='agent_number')                 AS has_agent_number_column,
--     EXISTS (SELECT 1 FROM pg_indexes
--              WHERE schemaname='public'
--                AND indexname='idx_policies_orphan_lookup')     AS has_orphan_index,
--     EXISTS (SELECT 1 FROM pg_trigger
--              WHERE tgname='agent_contracts_auto_link')         AS has_trigger,
--     EXISTS (SELECT 1 FROM pg_publication_tables
--              WHERE pubname='supabase_realtime'
--                AND schemaname='public' AND tablename='policies') AS in_publication;
