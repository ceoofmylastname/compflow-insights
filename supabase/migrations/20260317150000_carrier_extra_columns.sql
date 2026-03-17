-- Add missing columns to carriers + carrier_products tables

-- carriers: add short_name, logo_url, website, phone, notes
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS short_name TEXT;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS notes TEXT;

-- carrier_products: add product_type, is_active
ALTER TABLE public.carrier_products ADD COLUMN IF NOT EXISTS product_type TEXT;
ALTER TABLE public.carrier_products ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
