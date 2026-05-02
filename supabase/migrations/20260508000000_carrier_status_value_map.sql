-- Carrier-status mapping infrastructure for the Policy Import Wizard.
--
-- Per Wiki/schema-spec.md (carrier_field_mappings.status_value_map) and
-- Wiki/carrier-ingest-pipeline.md (carrier-specific status translation),
-- the canonical policies.status enum is exactly:
--   Draft, Submitted, Pending, Active, Terminated, Potential Lapse
-- Carriers ship statements using carrier-specific vocabulary
-- ("Issued", "Issue Paid", "First Year Paid", "Free Look", etc.) that
-- must be translated to the canonical enum.
--
-- The implemented table is carrier_profiles (per-tenant, keyed by
-- carrier_name). It plays the role the wiki spec calls
-- carrier_field_mappings. This migration:
--   1. Adds status_value_map JSONB to carrier_profiles
--   2. Backfills the column for every existing row whose value is null
--      or empty using the platform default mappings
--   3. Adds the update_carrier_status_mapping RPC for the inline picker
--      in the Policy Import Wizard's Validate step
--
-- The same mappings are mirrored in seeds/carrier-status-mappings.json
-- and src/lib/carrier-status-mapping.ts. Keep all three in sync if you
-- ever change them.

-- ============================================================================
-- 1. Add status_value_map column
-- ============================================================================

ALTER TABLE public.carrier_profiles
  ADD COLUMN IF NOT EXISTS status_value_map JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================================
-- 2. Backfill defaults for rows that are null or empty
-- ============================================================================

UPDATE public.carrier_profiles
SET status_value_map = '{
  "Issued": "Active",
  "Issue Paid": "Active",
  "Issued Paid": "Active",
  "First Year Paid": "Active",
  "Inforce": "Active",
  "In Force": "Active",
  "Active": "Active",
  "Submitted": "Submitted",
  "App Submitted": "Submitted",
  "Application Submitted": "Submitted",
  "Pending": "Pending",
  "Pending Underwriting": "Pending",
  "Pending Issue": "Pending",
  "Underwriting": "Pending",
  "Approved": "Pending",
  "Free Look": "Pending",
  "Draft": "Draft",
  "Saved": "Draft",
  "Terminated": "Terminated",
  "Lapsed": "Terminated",
  "Cancelled": "Terminated",
  "Canceled": "Terminated",
  "Surrendered": "Terminated",
  "NTO": "Terminated",
  "Not Taken": "Terminated",
  "Declined": "Terminated",
  "Withdrawn": "Terminated",
  "Potential Lapse": "Potential Lapse",
  "Past Due": "Potential Lapse",
  "Grace Period": "Potential Lapse"
}'::jsonb
WHERE status_value_map IS NULL OR status_value_map = '{}'::jsonb;

-- ============================================================================
-- 3. RPC: update_carrier_status_mapping
-- ============================================================================
--
-- Called by the Policy Import Wizard's inline picker. Owner-gated.
-- Upserts a single (raw_value -> canonical_value) entry into the
-- carrier's status_value_map for the current tenant. Creates a fresh
-- carrier_profiles row with sensible defaults if one does not exist yet
-- (the wizard runs before the user has saved a column-mapping profile).
--
-- p_carrier_name is matched case-insensitively to allow the wizard to
-- pass whatever spelling the user picked.

CREATE OR REPLACE FUNCTION public.update_carrier_status_mapping(
  p_carrier_name    TEXT,
  p_raw_value       TEXT,
  p_canonical_value TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_is_owner  BOOLEAN;
  v_clean_raw TEXT;
BEGIN
  IF p_carrier_name IS NULL OR length(trim(p_carrier_name)) = 0 THEN
    RAISE EXCEPTION 'carrier_name is required';
  END IF;
  IF p_raw_value IS NULL OR length(trim(p_raw_value)) = 0 THEN
    RAISE EXCEPTION 'raw_value is required';
  END IF;
  IF p_canonical_value NOT IN ('Draft', 'Submitted', 'Pending', 'Active', 'Terminated', 'Potential Lapse') THEN
    RAISE EXCEPTION 'canonical_value must be one of: Draft, Submitted, Pending, Active, Terminated, Potential Lapse';
  END IF;

  -- Resolve caller's tenant + owner flag from the agents table.
  SELECT a.tenant_id, a.is_owner
  INTO   v_tenant_id, v_is_owner
  FROM   public.agents a
  WHERE  a.auth_user_id = auth.uid()
  LIMIT  1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_is_owner IS NOT TRUE THEN
    RAISE EXCEPTION 'Owner access required';
  END IF;

  v_clean_raw := trim(p_raw_value);

  -- Find a profile row case-insensitively. Create one if missing.
  IF NOT EXISTS (
    SELECT 1 FROM public.carrier_profiles
    WHERE tenant_id = v_tenant_id AND lower(carrier_name) = lower(trim(p_carrier_name))
  ) THEN
    INSERT INTO public.carrier_profiles (tenant_id, carrier_name, column_mappings, custom_fields, status_value_map)
    VALUES (v_tenant_id, trim(p_carrier_name), '{}'::jsonb, '[]'::jsonb,
            jsonb_build_object(v_clean_raw, p_canonical_value));
  ELSE
    UPDATE public.carrier_profiles
    SET status_value_map = COALESCE(status_value_map, '{}'::jsonb) ||
                           jsonb_build_object(v_clean_raw, p_canonical_value),
        updated_at = now()
    WHERE tenant_id = v_tenant_id AND lower(carrier_name) = lower(trim(p_carrier_name));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_carrier_status_mapping(TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 4. Verification
-- ============================================================================
-- After paste, run:
--
--   SELECT
--     EXISTS (SELECT 1 FROM information_schema.columns
--             WHERE table_schema='public' AND table_name='carrier_profiles'
--               AND column_name='status_value_map')                          AS has_column,
--     EXISTS (SELECT 1 FROM pg_proc WHERE proname='update_carrier_status_mapping') AS has_rpc;
--
-- Both should return true. Then:
--
--   SELECT carrier_name, jsonb_pretty(status_value_map) FROM public.carrier_profiles LIMIT 3;
--
-- should show the seeded keys.
