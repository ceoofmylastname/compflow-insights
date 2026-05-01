-- Adds needs_review flag + reasons array to policies, used by carrier
-- statement imports to surface rows where the system can't deterministically
-- match the policy or the writing agent. Keeps both ingest concerns under
-- a single triage column.

ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review_reasons TEXT[] NOT NULL DEFAULT '{}';

-- Partial index: only the rows actually flagged. Cheap and fast for the
-- "Needs Review" filter on Book of Business.
CREATE INDEX IF NOT EXISTS idx_policies_needs_review
  ON public.policies(tenant_id, created_at DESC)
  WHERE needs_review = true;
