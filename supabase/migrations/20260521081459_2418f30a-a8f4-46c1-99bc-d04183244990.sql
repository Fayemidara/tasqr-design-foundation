-- Roll back owner-only SELECT and the view
DROP VIEW IF EXISTS public.seller_profiles_public;
DROP POLICY IF EXISTS "Sellers can view own seller profile" ON public.seller_profiles;

-- Re-enable public row visibility (column-level grants will limit what's actually returned)
CREATE POLICY "Anyone can view seller profiles"
ON public.seller_profiles
FOR SELECT
TO anon, authenticated
USING (true);

-- Column-level SELECT: revoke default, grant only safe public columns
REVOKE SELECT ON public.seller_profiles FROM anon, authenticated;

GRANT SELECT (id, user_id, handle, bio, website, reliability_score, created_at)
ON public.seller_profiles TO anon, authenticated;

-- Owner-side full-row access via SECURITY DEFINER RPC (filters by auth.uid())
CREATE OR REPLACE FUNCTION public.get_my_seller_profile()
RETURNS SETOF public.seller_profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.seller_profiles WHERE user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_seller_profile() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_seller_profile() TO authenticated;
