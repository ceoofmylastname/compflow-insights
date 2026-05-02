CREATE OR REPLACE FUNCTION public.current_agent_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.agents WHERE auth_user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_owner_or_manager()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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

DROP POLICY IF EXISTS "Tenant members can view contracts"          ON public.agent_contracts;
DROP POLICY IF EXISTS "Tenant members can view agent contracts"    ON public.agent_contracts;
DROP POLICY IF EXISTS "Owners can manage contracts"                ON public.agent_contracts;
DROP POLICY IF EXISTS "Owners can insert agent contracts"          ON public.agent_contracts;
DROP POLICY IF EXISTS "Owners can update agent contracts"          ON public.agent_contracts;
DROP POLICY IF EXISTS "Owners can delete agent contracts"          ON public.agent_contracts;
DROP POLICY IF EXISTS "Agents can view own and downline contracts" ON public.agent_contracts;
DROP POLICY IF EXISTS agent_contracts_select ON public.agent_contracts;
DROP POLICY IF EXISTS agent_contracts_insert ON public.agent_contracts;
DROP POLICY IF EXISTS agent_contracts_update ON public.agent_contracts;
DROP POLICY IF EXISTS agent_contracts_delete ON public.agent_contracts;

CREATE POLICY agent_contracts_select
  ON public.agent_contracts FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_current_agent_tenant_id()
    AND (
      agent_id = public.current_agent_id()
      OR agent_id IN (SELECT public.get_downline_agent_ids(public.get_current_agent_email()))
      OR public.is_owner_or_manager()
    )
  );

CREATE POLICY agent_contracts_insert
  ON public.agent_contracts FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_agent_tenant_id()
    AND (
      agent_id = public.current_agent_id()
      OR public.is_owner_or_manager()
    )
  );

CREATE POLICY agent_contracts_update
  ON public.agent_contracts FOR UPDATE TO authenticated
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

CREATE POLICY agent_contracts_delete
  ON public.agent_contracts FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_current_agent_tenant_id()
    AND public.is_owner_or_manager()
  );