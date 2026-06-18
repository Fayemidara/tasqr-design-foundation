
-- 1. seller_profiles: revoke sensitive columns from public roles
REVOKE SELECT (
  airtm_email,
  api_key_hash,
  api_key_prefix,
  api_key_encrypted,
  api_key_last_used,
  total_earnings,
  withdrawable_balance,
  total_paid_out,
  last_paid_out_at,
  draft_input_schema
) ON public.seller_profiles FROM anon, authenticated;

-- 2. agents: revoke endpoint_url from public roles
REVOKE SELECT (endpoint_url) ON public.agents FROM anon, authenticated;

-- Owner-only RPC to read their own agent's endpoint_url for editing
CREATE OR REPLACE FUNCTION public.get_my_agent_endpoint(_agent_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.endpoint_url
  FROM public.agents a
  WHERE a.id = _agent_id
    AND public.is_seller_owner(a.seller_id)
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_agent_endpoint(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_agent_endpoint(uuid) TO authenticated;

-- 3. reviews: revoke buyer_id from public reads
REVOKE SELECT (buyer_id) ON public.reviews FROM anon, authenticated;
-- Owner still needs to read their own buyer_id (e.g., to check "your review"); grant to authenticated via separate flow if needed later.
-- Grant buyer_id back to authenticated so the run owner can verify ownership; rows are still RLS-gated to public read but column visible only to authenticated.
GRANT SELECT (buyer_id) ON public.reviews TO authenticated;

-- 4. set_updated_at: fix search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
