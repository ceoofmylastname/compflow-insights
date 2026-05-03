ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS agent_number TEXT;

UPDATE public.policies p
   SET agent_number = ac.agent_number
  FROM public.agent_contracts ac
 WHERE p.resolved_agent_id IS NOT NULL
   AND p.tenant_id = ac.tenant_id
   AND p.carrier   = ac.carrier
   AND p.resolved_agent_id = ac.agent_id
   AND p.agent_number IS NULL;

CREATE INDEX IF NOT EXISTS idx_policies_orphan_lookup
  ON public.policies (tenant_id, carrier, agent_number)
  WHERE resolved_agent_id IS NULL;

CREATE OR REPLACE FUNCTION public.auto_link_orphan_policies()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attached_count INTEGER;
BEGIN
  IF NEW.agent_number IS NULL OR NEW.agent_number = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.agent_number, '') = COALESCE(NEW.agent_number, '') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.policy_status_history
    (tenant_id, policy_id, from_status, to_status, source, changed_by)
  SELECT p.tenant_id, p.id, p.status, p.status, 'contract_added_backfill', NULL
    FROM public.policies p
   WHERE p.tenant_id    = NEW.tenant_id
     AND p.carrier      = NEW.carrier
     AND p.agent_number = NEW.agent_number
     AND p.resolved_agent_id IS NULL;

  UPDATE public.policies p
     SET resolved_agent_id = NEW.agent_id
   WHERE p.tenant_id    = NEW.tenant_id
     AND p.carrier      = NEW.carrier
     AND p.agent_number = NEW.agent_number
     AND p.resolved_agent_id IS NULL;

  GET DIAGNOSTICS v_attached_count = ROW_COUNT;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_contracts_auto_link ON public.agent_contracts;
CREATE TRIGGER agent_contracts_auto_link
  AFTER INSERT OR UPDATE OF agent_number ON public.agent_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_orphan_policies();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'policies'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.policies';
  END IF;
END;
$$;

ALTER TABLE public.policies REPLICA IDENTITY FULL;