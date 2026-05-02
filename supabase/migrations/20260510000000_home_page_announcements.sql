-- Home page announcements: action items, leadership broadcasts, promotion
-- targets. Per Wiki/home-page-and-announcements.md and Wiki/schema-spec.md
-- (sections user_action_items, leadership_broadcasts, promotion_targets).
--
-- Visibility per Wiki/home-page-and-announcements.md "Permissions":
--   user_action_items     : per-user; only the addressee can read/update
--   leadership_broadcasts : tenant-scoped; readable by every member;
--                           writable by owner or anyone listed as an
--                           upline (manager) on at least one agents row
--   promotion_targets     : tenant-scoped; readable by every member;
--                           writable by owner only
--
-- The auto-dismiss rule on action items is enforced lazily by the home
-- page reading code: when a row's condition is satisfied (e.g. an
-- agent_contracts row appears for action_type='submit_writing_number'),
-- the client stamps resolved_at and the banner disappears next render.

-- ============================================================================
-- 1. user_action_items
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_action_items (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id                  UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  action_type              TEXT NOT NULL,
  title                    TEXT NOT NULL,
  body                     TEXT,
  cta_text                 TEXT,
  cta_url                  TEXT,
  is_dismissible           BOOLEAN NOT NULL DEFAULT true,
  auto_resolve_condition   TEXT,
  dismissed_at             TIMESTAMPTZ,
  resolved_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_action_items_user_open
  ON public.user_action_items(user_id, created_at DESC)
  WHERE dismissed_at IS NULL AND resolved_at IS NULL;

ALTER TABLE public.user_action_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_action_items_select ON public.user_action_items;
CREATE POLICY user_action_items_select
  ON public.user_action_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = user_action_items.user_id
        AND a.auth_user_id = auth.uid()
    )
  );

-- Writers: the addressee themselves (to dismiss / resolve), plus owners.
DROP POLICY IF EXISTS user_action_items_update ON public.user_action_items;
CREATE POLICY user_action_items_update
  ON public.user_action_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = user_action_items.user_id
        AND a.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.tenant_id = user_action_items.tenant_id
        AND a.auth_user_id = auth.uid()
        AND a.is_owner = true
    )
  );

-- Inserts only by tenant members (in practice the system creates these,
-- not the UI; the policy is permissive enough for an admin tool to
-- backfill items if needed).
DROP POLICY IF EXISTS user_action_items_insert ON public.user_action_items;
CREATE POLICY user_action_items_insert
  ON public.user_action_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.tenant_id = user_action_items.tenant_id
        AND a.auth_user_id = auth.uid()
    )
  );

-- ============================================================================
-- 2. leadership_broadcasts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.leadership_broadcasts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by_user_id  UUID NOT NULL REFERENCES public.agents(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  body                TEXT,
  image_url           TEXT,
  cta_text            TEXT,
  cta_url             TEXT,
  targeting           JSONB NOT NULL DEFAULT '{"all": true}'::jsonb,
  start_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at              TIMESTAMPTZ,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leadership_broadcasts_tenant_active
  ON public.leadership_broadcasts(tenant_id, is_active, start_at DESC);

ALTER TABLE public.leadership_broadcasts ENABLE ROW LEVEL SECURITY;

-- Read: every tenant member. Targeting is enforced by the client-side
-- query so the policy can stay simple.
DROP POLICY IF EXISTS leadership_broadcasts_select ON public.leadership_broadcasts;
CREATE POLICY leadership_broadcasts_select
  ON public.leadership_broadcasts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.tenant_id = leadership_broadcasts.tenant_id
        AND a.auth_user_id = auth.uid()
    )
  );

-- Write: owner OR a manager (anyone with at least one direct downline).
-- A manager is identified by their email appearing as upline_email on at
-- least one other agent row in the same tenant.
DROP POLICY IF EXISTS leadership_broadcasts_insert ON public.leadership_broadcasts;
CREATE POLICY leadership_broadcasts_insert
  ON public.leadership_broadcasts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.tenant_id = leadership_broadcasts.tenant_id
        AND a.auth_user_id = auth.uid()
        AND (
          a.is_owner = true
          OR EXISTS (
            SELECT 1 FROM public.agents downline
            WHERE downline.tenant_id = a.tenant_id
              AND downline.upline_email = a.email
          )
        )
    )
  );

DROP POLICY IF EXISTS leadership_broadcasts_update ON public.leadership_broadcasts;
CREATE POLICY leadership_broadcasts_update
  ON public.leadership_broadcasts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.tenant_id = leadership_broadcasts.tenant_id
        AND a.auth_user_id = auth.uid()
        AND (
          a.is_owner = true
          OR a.id = leadership_broadcasts.created_by_user_id
        )
    )
  );

DROP POLICY IF EXISTS leadership_broadcasts_delete ON public.leadership_broadcasts;
CREATE POLICY leadership_broadcasts_delete
  ON public.leadership_broadcasts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.tenant_id = leadership_broadcasts.tenant_id
        AND a.auth_user_id = auth.uid()
        AND (
          a.is_owner = true
          OR a.id = leadership_broadcasts.created_by_user_id
        )
    )
  );

-- ============================================================================
-- 3. promotion_targets
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.promotion_targets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_position_id    UUID NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  to_position_id      UUID NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  criteria            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, from_position_id, to_position_id)
);

CREATE INDEX IF NOT EXISTS idx_promotion_targets_tenant_from
  ON public.promotion_targets(tenant_id, from_position_id);

ALTER TABLE public.promotion_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotion_targets_select ON public.promotion_targets;
CREATE POLICY promotion_targets_select
  ON public.promotion_targets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.tenant_id = promotion_targets.tenant_id
        AND a.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS promotion_targets_write ON public.promotion_targets;
CREATE POLICY promotion_targets_write
  ON public.promotion_targets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.tenant_id = promotion_targets.tenant_id
        AND a.auth_user_id = auth.uid()
        AND a.is_owner = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.tenant_id = promotion_targets.tenant_id
        AND a.auth_user_id = auth.uid()
        AND a.is_owner = true
    )
  );

-- ============================================================================
-- 4. Verification
-- ============================================================================
--   SELECT
--     EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_action_items')      AS has_action_items,
--     EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leadership_broadcasts')  AS has_broadcasts,
--     EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='promotion_targets')      AS has_targets;
