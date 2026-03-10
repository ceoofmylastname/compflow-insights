ALTER TABLE public.commission_payouts ADD COLUMN IF NOT EXISTS payout_type text NOT NULL DEFAULT 'direct';
ALTER TABLE public.commission_payouts ADD COLUMN IF NOT EXISTS contract_type text;