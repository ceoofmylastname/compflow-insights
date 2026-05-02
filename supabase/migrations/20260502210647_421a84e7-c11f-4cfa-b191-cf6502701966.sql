-- Owner bulk delete on Book of Business: audit table + RPC.

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
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = ANY (policy_ids)
      AND p.tenant_id <> v_tenant_id
  ) THEN
    RAISE EXCEPTION 'bulk_delete_policies: cross-tenant id rejected';
  END IF;

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
    NULL::UUID,
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

  DELETE FROM public.commission_payouts
   WHERE policy_id = ANY (policy_ids);

  DELETE FROM public.policy_status_history
   WHERE policy_id = ANY (policy_ids);

  DELETE FROM public.policies
   WHERE id = ANY (policy_ids)
     AND tenant_id = v_tenant_id;

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