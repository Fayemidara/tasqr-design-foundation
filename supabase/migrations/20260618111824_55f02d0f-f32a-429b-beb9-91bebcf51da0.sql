-- Hide agents.endpoint_url from anon/authenticated SELECT. Sellers read their own via get_my_agent_endpoint RPC.
REVOKE SELECT (endpoint_url) ON public.agents FROM anon, authenticated;

-- Hide reviews.buyer_id from anon/authenticated SELECT to prevent buyer UUID enumeration.
REVOKE SELECT (buyer_id) ON public.reviews FROM anon, authenticated;