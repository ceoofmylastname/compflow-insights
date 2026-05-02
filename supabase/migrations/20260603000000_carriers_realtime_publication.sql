-- Carrier roster inheritance: ensure DELETE/INSERT/UPDATE row events on
-- public.carriers surface to Supabase Realtime subscribers.
--
-- Required so the new realtime subscription wired into useCarriers can
-- fire on owner adds/removes and propagate to every active agent
-- session in the tenant within ~1s. Without this, Realtime would
-- silently no-op and dropdowns would only refresh on TanStack
-- staleTime expiry (currently 2 minutes) or a manual page refresh.
--
-- Both statements are idempotent. The publication add is gated on
-- pg_publication_tables so re-running the migration on a tenant where
-- it is already applied is a no-op. REPLICA IDENTITY FULL is naturally
-- idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'carriers'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.carriers';
  END IF;
END;
$$;

ALTER TABLE public.carriers REPLICA IDENTITY FULL;

-- Verification (run manually after migrate):
--   SELECT
--     EXISTS (SELECT 1 FROM pg_publication_tables
--              WHERE pubname='supabase_realtime'
--                AND schemaname='public'
--                AND tablename='carriers') AS in_publication,
--     (SELECT relreplident FROM pg_class WHERE oid='public.carriers'::regclass) AS replica_identity;
--   -- Expect: in_publication = true, replica_identity = 'f' (FULL)
