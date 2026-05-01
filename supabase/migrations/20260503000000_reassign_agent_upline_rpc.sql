-- Owner-driven upline reassignment.
--
-- Wraps three writes in a single transaction so the time-stamped hierarchy
-- chain stays consistent with the live agents row:
--   1. Close the agent's currently-open agent_position_history row (end_date = today).
--   2. Insert a new history row with the new upline_email and the same position_id.
--   3. Update the agents table's denormalized upline_email cache.
--
-- All guards run server-side: caller must be a tenant owner, and the target
-- agent + new upline must be in the caller's tenant. Cycle prevention is the
-- caller's responsibility (UI validates before invocation).

CREATE OR REPLACE FUNCTION public.reassign_agent_upline(
  p_agent_id UUID,
  p_new_upline_email TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_caller_is_owner BOOLEAN;
  v_target_tenant_id UUID;
  v_target_email TEXT;
  v_new_upline_tenant_id UUID;
  v_current_position_id UUID;
BEGIN
  -- Caller identity + ownership check
  SELECT tenant_id, is_owner INTO v_tenant_id, v_caller_is_owner
    FROM public.agents
   WHERE auth_user_id = auth.uid()
   LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Caller is not a tenant member';
  END IF;

  IF NOT v_caller_is_owner THEN
    RAISE EXCEPTION 'Only owners can reassign uplines';
  END IF;

  -- Target agent must exist in the same tenant
  SELECT tenant_id, email INTO v_target_tenant_id, v_target_email
    FROM public.agents
   WHERE id = p_agent_id;

  IF v_target_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;

  IF v_target_tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'Cross-tenant reassignment not allowed';
  END IF;

  -- Cannot self-upline
  IF v_target_email = p_new_upline_email THEN
    RAISE EXCEPTION 'An agent cannot be their own upline';
  END IF;

  -- New upline must exist in the same tenant
  SELECT tenant_id INTO v_new_upline_tenant_id
    FROM public.agents
   WHERE email = p_new_upline_email
     AND tenant_id = v_tenant_id
   LIMIT 1;

  IF v_new_upline_tenant_id IS NULL THEN
    RAISE EXCEPTION 'New upline not found in tenant';
  END IF;

  -- Capture current position so the new history row preserves it.
  SELECT position_id INTO v_current_position_id
    FROM public.agent_position_history
   WHERE agent_id = p_agent_id
     AND end_date IS NULL
     AND position_id IS NOT NULL
   ORDER BY start_date DESC, created_at DESC
   LIMIT 1;

  -- 1. Close the open history row(s) for this agent.
  UPDATE public.agent_position_history
     SET end_date = CURRENT_DATE
   WHERE agent_id = p_agent_id
     AND end_date IS NULL;

  -- 2. Insert the new history row. position_id may be NULL if the agent has
  --    never been assigned a position; that's OK for the upline-only change.
  INSERT INTO public.agent_position_history (
    tenant_id, agent_id, position_id, upline_email, start_date
  ) VALUES (
    v_tenant_id, p_agent_id, v_current_position_id, p_new_upline_email, CURRENT_DATE
  );

  -- 3. Sync the live agents row.
  UPDATE public.agents
     SET upline_email = p_new_upline_email
   WHERE id = p_agent_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_agent_upline(UUID, TEXT) TO authenticated;
