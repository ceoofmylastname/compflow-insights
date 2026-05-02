-- Fix agent_contracts RLS so agents can self-insert and self-update
-- their own writing numbers from Settings -> My Writing Numbers.
--
-- Bug: the prior INSERT/UPDATE policies (20260317193345) gated on
-- is_owner = true, so a non-owner agent saving their writing number
-- got "new row violates row-level security policy for table
-- 'agent_contracts'".
--
-- Corrected matrix (per Wiki/hierarchy-permissions-model.md):
--   SELECT  -> tenant + (self OR downline OR is_owner_or_manager())
--   INSERT  -> tenant + (self OR is_owner_or_manager())
--   UPDATE  -> tenant + (self OR is_owner_or_manager())
--   DELETE  -> tenant + is_owner_or_manager()
--
-- Migration is idempotent: every DROP uses IF EXISTS, every CREATE uses
-- OR REPLACE for functions and DROP-then-CREATE for policies.

-- ============================================================================
-- 1. Helper functions
-- ============================================================================
--
-- current_agent_id() returns the caller's agents.id (NULL when
-- auth.uid() is unset or no matching row exists). SECURITY DEFINER so
-- RLS can call it without recursion.

CREATE OR REPLACE FUNCTION public.current_agent_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.agents WHERE auth_user_id = auth.uid() LIMIT 1
$$;

-- is_owner_or_manager() returns TRUE when the caller is the tenant
-- owner OR is a "manager" — defined as anyone with at least one direct
-- downline (their email appears as upline_email on at least one other
-- agent row in the same tenant). Returns FALSE safely when auth.uid()
-- is unset or there's no agents row for the caller.
--
-- This matches the manager definition used by the
-- leadership_broadcasts insert RLS and by useIsOwnerOrManager on the
-- client (Wiki/home-page-and-announcements.md).

CREATE OR REPLACE FUNCTION public.is_owner_or_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agents me
    WHERE me.auth_user_id = auth.uid()
      AND (
        me.is_owner = true
        OR EXISTS (
          SELECT 1 FROM public.agents downline
          WHERE downline.tenant_id = me.tenant_id
            AND downline.upline_email = me.email
        )
      )
  )
$$;

-- ============================================================================
-- 2. Drop every prior agent_contracts policy
-- ============================================================================
--
-- Live state in production right now (traced through migrations
-- 20260316130000, 20260317193345, 20260318055149) has six policies on
-- agent_contracts. Drop them all and start clean. The single
-- "Tenant members can view contracts" was effectively over-permissive
-- because it OR'd with the tighter SELECT policy; collapsing to one
-- canonical SELECT policy fixes that as a side effect.

DROP POLICY IF EXISTS "Tenant members can view contracts"        ON public.agent_contracts;
DROP POLICY IF EXISTS "Tenant members can view agent contracts"  ON public.agent_contracts;
DROP POLICY IF EXISTS "Owners can manage contracts"              ON public.agent_contracts;
DROP POLICY IF EXISTS "Owners can insert agent contracts"        ON public.agent_contracts;
DROP POLICY IF EXISTS "Owners can update agent contracts"        ON public.agent_contracts;
DROP POLICY IF EXISTS "Owners can delete agent contracts"        ON public.agent_contracts;
DROP POLICY IF EXISTS "Agents can view own and downline contracts" ON public.agent_contracts;
-- Defensive: drop anything we might be about to recreate.
DROP POLICY IF EXISTS agent_contracts_select ON public.agent_contracts;
DROP POLICY IF EXISTS agent_contracts_insert ON public.agent_contracts;
DROP POLICY IF EXISTS agent_contracts_update ON public.agent_contracts;
DROP POLICY IF EXISTS agent_contracts_delete ON public.agent_contracts;

-- ============================================================================
-- 3. Corrected policy matrix
-- ============================================================================

-- SELECT: agent sees their own row, every row in their downline tree,
-- and (if owner or manager) every row in the tenant.
CREATE POLICY agent_contracts_select
  ON public.agent_contracts FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_current_agent_tenant_id()
    AND (
      agent_id = public.current_agent_id()
      OR agent_id IN (SELECT public.get_downline_agent_ids(public.get_current_agent_email()))
      OR public.is_owner_or_manager()
    )
  );

-- INSERT: agent inserts their own writing number row. Owner or
-- manager can insert on behalf of any agent in the tenant. Tenant_id
-- guard always required.
CREATE POLICY agent_contracts_insert
  ON public.agent_contracts FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_agent_tenant_id()
    AND (
      agent_id = public.current_agent_id()
      OR public.is_owner_or_manager()
    )
  );

-- UPDATE: agent updates their own row (status flip, agent_number
-- correction). Owner or manager can update any agent in the tenant.
-- Both USING (existing row) and WITH CHECK (post-update row) are
-- gated identically so an agent cannot reassign agent_id away from
-- themselves.
CREATE POLICY agent_contracts_update
  ON public.agent_contracts FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_current_agent_tenant_id()
    AND (
      agent_id = public.current_agent_id()
      OR public.is_owner_or_manager()
    )
  )
  WITH CHECK (
    tenant_id = public.get_current_agent_tenant_id()
    AND (
      agent_id = public.current_agent_id()
      OR public.is_owner_or_manager()
    )
  );

-- DELETE: owner or manager only. Agents cannot delete their own
-- contracts (deletes are administrative / data correction).
CREATE POLICY agent_contracts_delete
  ON public.agent_contracts FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_current_agent_tenant_id()
    AND public.is_owner_or_manager()
  );

-- ============================================================================
-- 4. Verification queries (run manually after migrate)
-- ============================================================================
--
-- (a) Inspect the new policy matrix:
--   SELECT polname, polcmd, polqual::text AS using_expr,
--          polwithcheck::text AS with_check_expr
--     FROM pg_policy
--    WHERE polrelid = 'public.agent_contracts'::regclass
--    ORDER BY polname;
--
-- (b) As a non-owner agent in the app, save a writing number on
--     Settings -> My Writing Numbers. Expect success, row lands with
--     agent_id = your agent id.
--
-- (c) As an owner, edit another agent's writing number from the
--     AgentRoster contracts panel. Expect success.
--
-- (d) As Agent A in the SQL editor (with the agent's JWT, not the
--     service role), attempt:
--       UPDATE public.agent_contracts
--          SET agent_number = 'HACKED'
--        WHERE agent_id = '<Agent B id>';
--     Expect zero rows updated (RLS rejects the WITH CHECK).
