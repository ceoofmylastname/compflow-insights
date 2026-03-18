ALTER TABLE public.agents
  ADD COLUMN is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid;