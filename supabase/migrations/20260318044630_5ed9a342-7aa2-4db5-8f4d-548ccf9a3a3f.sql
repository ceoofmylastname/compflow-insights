
CREATE POLICY "Auto-claim agent record by email match"
ON public.agents
FOR UPDATE
TO authenticated
USING (
  auth_user_id IS NULL
  AND email = (SELECT email FROM auth.users WHERE id = auth.uid())
)
WITH CHECK (
  auth_user_id = auth.uid()
);
