-- Tenant-level custom fields registry
--
-- Promotes the per-import custom fields that already live on
-- carrier_profiles.custom_fields up to a tenant-scoped registry. Imports,
-- dashboards, and column pickers all read from this table going forward.
-- Stored values land in the JSONB custom_fields columns on the target tables
-- (policies / agents / commission_levels) keyed by field_key.

-- ============================================================================
-- 1. Registry table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  data_type TEXT NOT NULL CHECK (data_type IN ('text','number','currency','date','boolean','email','phone')),
  required BOOLEAN NOT NULL DEFAULT false,
  applies_to TEXT NOT NULL CHECK (applies_to IN ('policies','agents','commission_levels','all')),
  visible_in_dashboard BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, field_key, applies_to)
);

CREATE INDEX IF NOT EXISTS idx_tenant_custom_fields_tenant
  ON public.tenant_custom_fields(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_custom_fields_lookup
  ON public.tenant_custom_fields(tenant_id, applies_to);

-- ============================================================================
-- 2. Ensure JSONB custom_fields columns exist on target tables
--    policies.custom_fields was added in 20260502000000_policies_needs_review
--    by way of the carrier import path; idempotent here.
-- ============================================================================

ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.commission_levels
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_policies_custom_fields_gin
  ON public.policies USING gin (custom_fields);

CREATE INDEX IF NOT EXISTS idx_agents_custom_fields_gin
  ON public.agents USING gin (custom_fields);

-- ============================================================================
-- 3. RLS policies (uses the codebase's existing helper functions:
--    get_current_agent_tenant_id() and is_tenant_owner(auth.uid()).
--    No tenant_members table exists; ownership is on agents.is_owner.)
-- ============================================================================

ALTER TABLE public.tenant_custom_fields ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenant_custom_fields'
      AND policyname = 'Tenant members can read custom fields'
  ) THEN
    CREATE POLICY "Tenant members can read custom fields"
      ON public.tenant_custom_fields
      FOR SELECT
      TO authenticated
      USING (tenant_id = public.get_current_agent_tenant_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenant_custom_fields'
      AND policyname = 'Owners can insert custom fields'
  ) THEN
    CREATE POLICY "Owners can insert custom fields"
      ON public.tenant_custom_fields
      FOR INSERT
      TO authenticated
      WITH CHECK (
        tenant_id = public.get_current_agent_tenant_id()
        AND public.is_tenant_owner(auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenant_custom_fields'
      AND policyname = 'Owners can update custom fields'
  ) THEN
    CREATE POLICY "Owners can update custom fields"
      ON public.tenant_custom_fields
      FOR UPDATE
      TO authenticated
      USING (
        tenant_id = public.get_current_agent_tenant_id()
        AND public.is_tenant_owner(auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenant_custom_fields'
      AND policyname = 'Owners can delete custom fields'
  ) THEN
    CREATE POLICY "Owners can delete custom fields"
      ON public.tenant_custom_fields
      FOR DELETE
      TO authenticated
      USING (
        tenant_id = public.get_current_agent_tenant_id()
        AND public.is_tenant_owner(auth.uid())
      );
  END IF;
END$$;

-- ============================================================================
-- 4. updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_tenant_custom_fields_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_custom_fields_updated_at ON public.tenant_custom_fields;

CREATE TRIGGER tenant_custom_fields_updated_at
  BEFORE UPDATE ON public.tenant_custom_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tenant_custom_fields_updated_at();
