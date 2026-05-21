-- 1. Restrict seller_profiles direct reads to the owner only
DROP POLICY IF EXISTS "Seller profiles are viewable by everyone" ON public.seller_profiles;

CREATE POLICY "Sellers can view own seller profile"
ON public.seller_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 2. Public-safe view — excludes api_key_hash, api_key_prefix, api_key_last_used,
--    airtm_email, withdrawable_balance, total_earnings, draft_input_schema
CREATE OR REPLACE VIEW public.seller_profiles_public AS
SELECT
  id,
  user_id,
  handle,
  bio,
  website,
  reliability_score,
  created_at
FROM public.seller_profiles;

GRANT SELECT ON public.seller_profiles_public TO anon, authenticated;

-- 3. is_seller_owner: switch to SECURITY INVOKER. Now that seller_profiles SELECT
--    is owner-only, an invoker-context EXISTS check returns true iff the caller
--    is the owner — same semantics, no SECURITY DEFINER warning.
CREATE OR REPLACE FUNCTION public.is_seller_owner(seller_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.seller_profiles
    WHERE id = seller_profile_id
      AND user_id = auth.uid()
  );
$$;

-- 4. Trigger-only SECURITY DEFINER functions: revoke direct EXECUTE.
--    Triggers fire regardless of role EXECUTE grants, so this only blocks
--    direct RPC invocation by clients.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_agent_review_stats()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_agent_run_count()        FROM PUBLIC, anon, authenticated;
