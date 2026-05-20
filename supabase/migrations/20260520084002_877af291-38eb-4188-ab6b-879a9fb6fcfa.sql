DROP POLICY IF EXISTS "Anyone can view live agents" ON public.agents;
DROP POLICY IF EXISTS "Sellers can view own agents" ON public.agents;
DROP POLICY IF EXISTS "Sellers can insert own agents" ON public.agents;
DROP POLICY IF EXISTS "Sellers can insert their own agents" ON public.agents;
DROP POLICY IF EXISTS "Sellers can update own agents" ON public.agents;
DROP POLICY IF EXISTS "Sellers can delete own agents" ON public.agents;
DROP POLICY IF EXISTS "Sellers view transactions for own agents" ON public.transactions;
DROP POLICY IF EXISTS "Sellers view runs on own agents" ON public.runs;

DROP FUNCTION IF EXISTS public.is_seller_owner(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.is_seller_owner(seller_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.seller_profiles
    WHERE id = seller_profile_id
      AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_seller_owner(uuid) TO authenticated, anon;

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view live agents"
ON public.agents FOR SELECT
USING (status = 'live');

CREATE POLICY "Sellers can view own agents"
ON public.agents FOR SELECT
TO authenticated
USING (public.is_seller_owner(seller_id));

CREATE POLICY "Sellers can insert their own agents"
ON public.agents FOR INSERT
TO authenticated
WITH CHECK (
  seller_id IN (SELECT id FROM public.seller_profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Sellers can update own agents"
ON public.agents FOR UPDATE
TO authenticated
USING (public.is_seller_owner(seller_id))
WITH CHECK (public.is_seller_owner(seller_id));

CREATE POLICY "Sellers can delete own agents"
ON public.agents FOR DELETE
TO authenticated
USING (public.is_seller_owner(seller_id));

CREATE POLICY "Sellers view transactions for own agents"
ON public.transactions FOR SELECT
TO authenticated
USING (public.is_seller_owner(seller_id));

CREATE POLICY "Sellers view runs on own agents"
ON public.runs FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.agents a
  WHERE a.id = runs.agent_id AND public.is_seller_owner(a.seller_id)
));