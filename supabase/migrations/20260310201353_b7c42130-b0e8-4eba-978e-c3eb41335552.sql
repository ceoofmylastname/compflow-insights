
-- Add missing RLS policies for commission_payouts UPDATE/DELETE by owners
CREATE POLICY "Owners can update payouts" ON public.commission_payouts
FOR UPDATE TO authenticated
USING ((tenant_id = get_current_agent_tenant_id()) AND (EXISTS (SELECT 1 FROM agents WHERE agents.auth_user_id = auth.uid() AND agents.is_owner = true)));

CREATE POLICY "Owners can delete payouts" ON public.commission_payouts
FOR DELETE TO authenticated
USING ((tenant_id = get_current_agent_tenant_id()) AND (EXISTS (SELECT 1 FROM agents WHERE agents.auth_user_id = auth.uid() AND agents.is_owner = true)));

-- Add missing RLS policy for invites UPDATE (mark as accepted)
CREATE POLICY "Invitees can accept invites" ON public.invites
FOR UPDATE TO authenticated
USING (invitee_email = (SELECT email FROM agents WHERE auth_user_id = auth.uid() LIMIT 1));

-- Add UPDATE policy for tenants (owner can update agency name)
CREATE POLICY "Owners can update tenant" ON public.tenants
FOR UPDATE TO authenticated
USING (id = get_current_agent_tenant_id() AND EXISTS (SELECT 1 FROM agents WHERE agents.auth_user_id = auth.uid() AND agents.is_owner = true));

-- Add DELETE policy for policies (owner can delete all)
CREATE POLICY "Owners can delete policies" ON public.policies
FOR DELETE TO authenticated
USING ((tenant_id = get_current_agent_tenant_id()) AND (EXISTS (SELECT 1 FROM agents WHERE agents.auth_user_id = auth.uid() AND agents.is_owner = true)));

-- Add unique constraint for policy upsert
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policies_policy_number_tenant_id_key') THEN
    ALTER TABLE public.policies ADD CONSTRAINT policies_policy_number_tenant_id_key UNIQUE (policy_number, tenant_id);
  END IF;
END $$;

-- Add unique constraint for commission_payouts upsert
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commission_payouts_policy_id_agent_id_key') THEN
    ALTER TABLE public.commission_payouts ADD CONSTRAINT commission_payouts_policy_id_agent_id_key UNIQUE (policy_id, agent_id);
  END IF;
END $$;

-- Add unique constraint for agents upsert by email+tenant
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agents_email_tenant_id_key') THEN
    ALTER TABLE public.agents ADD CONSTRAINT agents_email_tenant_id_key UNIQUE (email, tenant_id);
  END IF;
END $$;

-- Configure fire-webhook edge function
-- (handled in config.toml update below)
