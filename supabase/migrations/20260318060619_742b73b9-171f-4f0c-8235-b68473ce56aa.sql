-- Create security definer function to claim agent records (bypasses RLS)
CREATE OR REPLACE FUNCTION public.claim_agent_record(
  p_agent_email TEXT,
  p_user_id UUID,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_npn TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agents
  SET auth_user_id = p_user_id,
      first_name = COALESCE(NULLIF(p_first_name, ''), first_name),
      last_name = COALESCE(NULLIF(p_last_name, ''), last_name),
      npn = COALESCE(NULLIF(p_npn, ''), npn),
      phone = COALESCE(NULLIF(p_phone, ''), phone)
  WHERE email = p_agent_email
    AND auth_user_id IS NULL;
END;
$$;

-- Fix existing broken record for support@automateai.us
UPDATE public.agents
SET auth_user_id = '6a23c6ef-70fe-482f-802d-004abe2d2d5c'
WHERE email = 'support@automateai.us'
  AND auth_user_id IS NULL;