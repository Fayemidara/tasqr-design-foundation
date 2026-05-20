-- =========================================================
-- TASQR SCHEMA
-- =========================================================

-- ---------- PROFILES ----------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer','seller','both')),
  is_seller_onboarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- ---------- SELLER PROFILES ----------
CREATE TABLE public.seller_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  handle text UNIQUE,
  bio text,
  website text,
  airtm_email text,
  api_key_hash text,
  api_key_prefix text,
  api_key_last_used timestamptz,
  reliability_score numeric NOT NULL DEFAULT 100,
  total_earnings numeric NOT NULL DEFAULT 0,
  withdrawable_balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.seller_profiles ENABLE ROW LEVEL SECURITY;

-- Public-facing seller info: anyone (including anon) can read
CREATE POLICY "Seller profiles are viewable by everyone"
  ON public.seller_profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own seller profile"
  ON public.seller_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own seller profile"
  ON public.seller_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Helper: is the current user the seller behind seller_profiles.id?
CREATE OR REPLACE FUNCTION public.is_seller_owner(_seller_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.seller_profiles
    WHERE id = _seller_id AND user_id = auth.uid()
  );
$$;

-- ---------- AGENTS ----------
CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text UNIQUE,
  short_description text NOT NULL,
  full_description text,
  category text,
  pricing_model text CHECK (pricing_model IN ('one_time','subscription','both')),
  one_time_price numeric,
  subscription_price numeric,
  input_schema jsonb,
  demo_inputs jsonb,
  demo_output text,
  endpoint_url text,
  output_type text CHECK (output_type IN ('text','markdown','image_url','document_url')),
  processing_time text CHECK (processing_time IN ('fast','medium','slow')),
  status text NOT NULL DEFAULT 'under_review' CHECK (status IN ('live','paused','under_review')),
  run_count integer NOT NULL DEFAULT 0,
  average_rating numeric NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view live agents"
  ON public.agents FOR SELECT
  USING (status = 'live');

CREATE POLICY "Sellers can view own agents"
  ON public.agents FOR SELECT TO authenticated
  USING (public.is_seller_owner(seller_id));

CREATE POLICY "Sellers can insert own agents"
  ON public.agents FOR INSERT TO authenticated
  WITH CHECK (public.is_seller_owner(seller_id));

CREATE POLICY "Sellers can update own agents"
  ON public.agents FOR UPDATE TO authenticated
  USING (public.is_seller_owner(seller_id))
  WITH CHECK (public.is_seller_owner(seller_id));

CREATE POLICY "Sellers can delete own agents"
  ON public.agents FOR DELETE TO authenticated
  USING (public.is_seller_owner(seller_id));

-- ---------- TRANSACTIONS ----------
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  transaction_type text CHECK (transaction_type IN ('one_time','subscription')),
  amount numeric NOT NULL,
  platform_fee numeric,
  seller_earnings numeric,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','held','released','refunded','disputed')),
  paystack_reference text,
  hold_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers view own transactions"
  ON public.transactions FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id);

CREATE POLICY "Sellers view transactions for own agents"
  ON public.transactions FOR SELECT TO authenticated
  USING (public.is_seller_owner(seller_id));

-- ---------- RUNS ----------
CREATE TABLE public.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tasqr_request_id text NOT NULL UNIQUE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  inputs jsonb,
  files jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','success','timeout','unreachable','error','malformed')),
  output_type text,
  output text,
  error_code text,
  error_message text,
  processing_time_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers view own runs"
  ON public.runs FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id);

CREATE POLICY "Sellers view runs on own agents"
  ON public.runs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = runs.agent_id AND public.is_seller_owner(a.seller_id)
  ));

-- ---------- REVIEWS ----------
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE REFERENCES public.runs(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are viewable by everyone"
  ON public.reviews FOR SELECT
  USING (true);

CREATE POLICY "Run owner can insert review"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = buyer_id
    AND EXISTS (
      SELECT 1 FROM public.runs r
      WHERE r.id = reviews.run_id AND r.buyer_id = auth.uid()
    )
  );

-- ---------- DISPUTES ----------
CREATE TABLE public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Filer views own disputes"
  ON public.disputes FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id);

CREATE POLICY "Run owner can file dispute"
  ON public.disputes FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = buyer_id
    AND EXISTS (
      SELECT 1 FROM public.runs r
      WHERE r.id = disputes.run_id AND r.buyer_id = auth.uid()
    )
  );

-- =========================================================
-- AUTH TRIGGER: create profile on signup
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'buyer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- INDEXES
-- =========================================================
CREATE INDEX idx_agents_seller_id ON public.agents(seller_id);
CREATE INDEX idx_agents_status ON public.agents(status);
CREATE INDEX idx_transactions_buyer ON public.transactions(buyer_id);
CREATE INDEX idx_transactions_seller ON public.transactions(seller_id);
CREATE INDEX idx_runs_buyer ON public.runs(buyer_id);
CREATE INDEX idx_runs_agent ON public.runs(agent_id);
CREATE INDEX idx_reviews_agent ON public.reviews(agent_id);
CREATE INDEX idx_disputes_buyer ON public.disputes(buyer_id);