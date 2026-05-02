-- Owner bulk delete on Book of Business per Wiki/book-of-business-page.md
-- and Wiki/hierarchy-permissions-model.md (owner-only enforcement).
--
-- Three layers of defense in depth:
--   1. UI hides the selection column / action bar for non-owners.
--   2. This RPC checks is_owner() at the top and raises EXCEPTION on
--      failure. It is the single client-reachable delete path.
--   3. The pre-existing "Owners can delete policies" RLS policy on
--      public.policies stays unchanged. The RPC is SECURITY DEFINER so
--      it can fan out to commission_payouts + policy_status_history
--      while still gating on the owner check at the top.
--
-- The audit table is the forensic trail. If the wrong rows get deleted,
-- policy_deletions_audit tells the owner exactly what was lost
-- (status, premium, paid commission total, deleted_by, reason).

-- ============================================================================
-- 1. policy_deletions_audit
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.policy_deletions_audit (
  id                                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_id                          UUID NOT NULL,
  policy_number                      TEXT,
  client_name                        TEXT,
  carrier_id                         UUID,
  agent_id                           UUID,
  status_at_deletion                 TEXT,
  annual_premium_at_deletion         NUMERIC,
  paid_commission_total_at_deletion  NUMERIC NOT NULL DEFAULT 0,
  deleted_by_user_id                 UUID NOT NULL,
  deleted_at                         TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason                             TEXT
);

CREATE INDEX IF NOT EXISTS idx_policy_deletions_audit_tenant_deleted_at
  ON public.policy_deletions_audit(tenant_id, deleted_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_deletions_audit_policy_id
  ON public.policy_deletions_audit(policy_id);

ALTER TABLE public.policy_deletions_audit ENABLE ROW LEVEL SECURITY;

-- Read: owners only (the audit is sensitive — agent-level activity, paid
-- commission totals, reasons). The RPC writes via SECURITY DEFINER so we
-- do not need an INSERT policy here.
DROP POLICY IF EXISTS policy_deletions_audit_select ON public.policy_deletions_audit;
CREATE POLICY policy_deletions_audit_select
  ON public.policy_deletions_audit FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.tenant_id = policy_deletions_audit.tenant_id
        AND a.auth_user_id = auth.uid()
        AND a.is_owner = true
    )
  );

-- ============================================================================
-- 2. bulk_delete_policies(policy_ids uuid[], reason text) RPC
-- ============================================================================
--
-- Returns one row per deleted policy so the client can fire a
-- policy.deleted webhook per row with the right payload (and so the
-- client can show a result toast with totals).
--
-- Operation order inside the function transaction:
--   1. Owner check (RAISE on failure).
--   2. Cross-tenant check (RAISE if any input id belongs to another
--      tenant — fail closed on destructive ops).
--   3. INSERT forensic snapshot rows into policy_deletions_audit.
--   4. DELETE commission_payouts WHERE policy_id IN (...).
--   5. DELETE policy_status_history WHERE policy_id IN (...).
--   6. DELETE policies WHERE id IN (...) AND tenant_id = caller_tenant.
--   7. RETURN QUERY of the audit rows so the client can fan out
--      policy.deleted webhooks per row.
--
-- Steps 4 and 5 are technically redundant with the ON DELETE CASCADE
-- on commission_payouts.policy_id and policy_status_history.policy_id,
-- but the spec calls for explicit cascade calls and the redundancy is
-- harmless (CASCADE on step 6 will find the child rows already gone).

CREATE OR REPLACE FUNCTION public.bulk_delete_policies(
  policy_ids UUID[],
  reason     TEXT DEFAULT NULL
)
RETURNS TABLE (
  deleted_policy_id          UUID,
  agent_id                   UUID,
  status_at_deletion         TEXT,
  annual_premium_at_deletion NUMERIC,
  paid_commission_total      NUMERIC,
  audit_id                   UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_agent_id   UUID;
  v_tenant_id  UUID;
  v_is_owner   BOOLEAN;
BEGIN
  -- Layer 2 owner check. SECURITY DEFINER bypasses RLS so the explicit
  -- check here is what stops a non-owner from invoking the RPC.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'bulk_delete_policies: not authenticated';
  END IF;

  SELECT id, tenant_id, is_owner
    INTO v_agent_id, v_tenant_id, v_is_owner
    FROM public.agents
    WHERE auth_user_id = v_user_id
    LIMIT 1;

  IF v_agent_id IS NULL OR v_is_owner IS NOT TRUE THEN
    RAISE EXCEPTION 'bulk_delete_policies: caller is not an owner';
  END IF;

  IF policy_ids IS NULL OR array_length(policy_ids, 1) IS NULL THEN
    RETURN; -- empty input, empty result set, nothing deleted.
  END IF;

  -- Cross-tenant guard. Reject the whole batch if anything looks off.
  IF EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = ANY (policy_ids)
      AND p.tenant_id <> v_tenant_id
  ) THEN
    RAISE EXCEPTION 'bulk_delete_policies: cross-tenant id rejected';
  END IF;

  -- 3. Forensic snapshot. Joining paid_totals by SUM gives us the
  --    "paid commission total at deletion" the audit table records.
  INSERT INTO public.policy_deletions_audit (
    tenant_id, policy_id, policy_number, client_name, carrier_id,
    agent_id, status_at_deletion, annual_premium_at_deletion,
    paid_commission_total_at_deletion, deleted_by_user_id, reason
  )
  SELECT
    p.tenant_id,
    p.id,
    p.policy_number,
    p.client_name,
    p.carrier_id,
    p.resolved_agent_id,
    p.status,
    p.annual_premium,
    COALESCE(pt.paid_total, 0),
    v_agent_id,
    bulk_delete_policies.reason
    FROM public.policies p
    LEFT JOIN (
      SELECT cp.policy_id,
             SUM(cp.commission_amount) AS paid_total
        FROM public.commission_payouts cp
       WHERE cp.policy_id = ANY (policy_ids)
         AND cp.payment_status = 'paid'
       GROUP BY cp.policy_id
    ) pt ON pt.policy_id = p.id
   WHERE p.id = ANY (policy_ids)
     AND p.tenant_id = v_tenant_id;

  -- 4. Cascade commission_payouts.
  DELETE FROM public.commission_payouts
   WHERE policy_id = ANY (policy_ids);

  -- 5. Cascade policy_status_history.
  DELETE FROM public.policy_status_history
   WHERE policy_id = ANY (policy_ids);

  -- 6. Hard delete the policies themselves.
  DELETE FROM public.policies
   WHERE id = ANY (policy_ids)
     AND tenant_id = v_tenant_id;

  -- 7. Return the audit rows we just inserted so the caller can fan out
  --    policy.deleted webhooks. Filtered by deleted_by_user_id +
  --    tenant_id to scope to this single invocation (rows inserted in
  --    this transaction are visible to this query).
  RETURN QUERY
  SELECT a.policy_id,
         a.agent_id,
         a.status_at_deletion,
         a.annual_premium_at_deletion,
         a.paid_commission_total_at_deletion,
         a.id
    FROM public.policy_deletions_audit a
   WHERE a.tenant_id = v_tenant_id
     AND a.deleted_by_user_id = v_agent_id
     AND a.policy_id = ANY (policy_ids)
   ORDER BY a.deleted_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_delete_policies(UUID[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_delete_policies(UUID[], TEXT) TO authenticated;

-- ============================================================================
-- 3. Verification (run manually after migrate)
-- ============================================================================
--   SELECT
--     EXISTS (SELECT 1 FROM information_schema.tables
--              WHERE table_schema='public' AND table_name='policy_deletions_audit') AS has_audit,
--     EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
--              WHERE n.nspname='public' AND p.proname='bulk_delete_policies')      AS has_rpc;
