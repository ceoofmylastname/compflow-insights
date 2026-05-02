-- Drafts UX: promote status='Draft' to canonical first-class state.
--
-- Per Wiki/book-of-business-page.md, Wiki/active-agent-billing-model.md, and
-- Wiki/schema-spec.md (policies table), drafts are:
--   - Private to their creator (never broadcast up the hierarchy)
--   - Excluded from commissions, payroll, leaderboards, billing snapshots
--   - The agent's private scratchpad until promoted to Submitted
--
-- The codebase had been using a parallel `is_draft BOOLEAN` column. This
-- migration makes status='Draft' the canonical marker, backfills existing
-- draft rows, hardens RLS so drafts are creator-only, and updates the
-- active-agent billing snapshot to exclude drafts. is_draft is kept for
-- backward compat but is no longer the source of truth.

-- ============================================================================
-- 1. Allow 'Draft' as a valid policy status value
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_policy_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS NOT NULL AND NEW.status NOT IN ('Draft', 'Submitted', 'Pending', 'Active', 'Terminated') THEN
    RAISE EXCEPTION 'Invalid policy status. Must be Draft, Submitted, Pending, Active, or Terminated';
  END IF;
  IF NEW.contract_type IS NOT NULL AND NEW.contract_type NOT IN ('Direct Pay', 'LOA') THEN
    RAISE EXCEPTION 'Invalid contract_type. Must be Direct Pay or LOA';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================================
-- 2. Backfill: any row with is_draft=true is now also status='Draft'.
--    Then sync is_draft to mirror status='Draft' so both views agree.
-- ============================================================================

UPDATE public.policies
   SET status = 'Draft'
 WHERE is_draft = true
   AND status IS DISTINCT FROM 'Draft';

UPDATE public.policies
   SET is_draft = (status = 'Draft');

-- ============================================================================
-- 3. RLS: drafts visible ONLY to the agent who created them. Non-drafts
--    follow the existing rules (own + downline + owner).
-- ============================================================================

DROP POLICY IF EXISTS "Agents can view policies" ON public.policies;

CREATE POLICY "Agents can view policies"
  ON public.policies
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_current_agent_tenant_id()
    AND (
      -- Drafts: only the creator (resolved_agent_id) can read
      (
        status = 'Draft'
        AND resolved_agent_id IN (
          SELECT id FROM public.agents WHERE auth_user_id = auth.uid()
        )
      )
      OR
      -- Non-drafts: existing rules (own row, downline, or tenant owner)
      (
        status IS DISTINCT FROM 'Draft'
        AND (
          resolved_agent_id IN (SELECT id FROM public.agents WHERE auth_user_id = auth.uid())
          OR resolved_agent_id IN (SELECT public.get_downline_agent_ids(public.get_current_agent_email()))
          OR EXISTS (SELECT 1 FROM public.agents WHERE auth_user_id = auth.uid() AND is_owner = true)
        )
      )
    )
  );

-- ============================================================================
-- 4. Active-agent billing snapshot: exclude drafts from the count
--    (drafts must not flow into billing per active-agent-billing-model.md).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.snapshot_active_agents(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count integer;
BEGIN
  SELECT COUNT(DISTINCT resolved_agent_id)
    INTO active_count
    FROM public.policies
   WHERE tenant_id = p_tenant_id
     AND created_at >= now() - interval '30 days'
     AND status IS DISTINCT FROM 'Draft';

  INSERT INTO public.billing_snapshots (tenant_id, snapshot_date, active_agent_count)
  VALUES (p_tenant_id, CURRENT_DATE, active_count)
  ON CONFLICT (tenant_id, snapshot_date) DO UPDATE
    SET active_agent_count = EXCLUDED.active_agent_count;

  RETURN active_count;
END;
$$;

-- ============================================================================
-- 5. Index to speed up the Drafts tab query (creator + status filter).
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_policies_drafts_by_creator
  ON public.policies(resolved_agent_id, draft_saved_at DESC)
  WHERE status = 'Draft';
