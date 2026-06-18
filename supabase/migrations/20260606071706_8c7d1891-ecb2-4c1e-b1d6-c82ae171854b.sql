REVOKE SELECT (endpoint_url) ON public.agents FROM anon, authenticated;
REVOKE SELECT (buyer_id) ON public.reviews FROM anon;