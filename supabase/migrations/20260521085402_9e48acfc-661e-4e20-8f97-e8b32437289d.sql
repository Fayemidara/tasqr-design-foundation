CREATE OR REPLACE FUNCTION public.get_agent_api_key_prefix(_agent_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.api_key_prefix
  FROM public.agents a
  JOIN public.seller_profiles sp ON sp.id = a.seller_id
  WHERE a.id = _agent_id
    AND a.status = 'live'
$$;

REVOKE ALL ON FUNCTION public.get_agent_api_key_prefix(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_agent_api_key_prefix(uuid) TO authenticated;