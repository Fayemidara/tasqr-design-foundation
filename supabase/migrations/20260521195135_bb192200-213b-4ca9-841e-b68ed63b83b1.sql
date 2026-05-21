CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  paystack_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers view own subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id);

CREATE POLICY "Buyers insert own subscriptions"
  ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Buyers update own subscriptions"
  ON public.subscriptions FOR UPDATE TO authenticated
  USING (auth.uid() = buyer_id)
  WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Sellers view subscriptions for own agents"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_seller_owner(seller_id));

CREATE INDEX idx_subscriptions_buyer ON public.subscriptions(buyer_id);
CREATE INDEX idx_subscriptions_agent ON public.subscriptions(agent_id);
