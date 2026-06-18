-- Add consecutive_failures column to subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0;

-- Buyer-callable RPC: increment failure counter for own subscription
CREATE OR REPLACE FUNCTION public.increment_subscription_failures(_sub_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _sub public.subscriptions; _new int;
BEGIN
  SELECT * INTO _sub FROM public.subscriptions WHERE id = _sub_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sub_not_found'; END IF;
  IF _sub.buyer_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.subscriptions
    SET consecutive_failures = consecutive_failures + 1
    WHERE id = _sub_id
    RETURNING consecutive_failures INTO _new;
  RETURN _new;
END; $$;

-- Buyer-callable RPC: reset failure counter for own subscription
CREATE OR REPLACE FUNCTION public.reset_subscription_failures(_sub_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _sub public.subscriptions;
BEGIN
  SELECT * INTO _sub FROM public.subscriptions WHERE id = _sub_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sub_not_found'; END IF;
  IF _sub.buyer_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.subscriptions SET consecutive_failures = 0 WHERE id = _sub_id;
END; $$;

-- Extend admin_restore_agent: also reactivate paused subscriptions for that agent.
CREATE OR REPLACE FUNCTION public.admin_restore_agent(_agent_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _seller_id uuid; _avg numeric;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.agents
    SET status = 'live', paused_reason = NULL, reliability_score = 100, restored_at = now()
    WHERE id = _agent_id
    RETURNING seller_id INTO _seller_id;
  IF _seller_id IS NOT NULL THEN
    SELECT AVG(reliability_score) INTO _avg FROM public.agents WHERE seller_id = _seller_id;
    UPDATE public.seller_profiles SET reliability_score = COALESCE(_avg, 100) WHERE id = _seller_id;
  END IF;
  -- Reactivate paused subscriptions for this agent.
  UPDATE public.subscriptions
    SET status = 'active', consecutive_failures = 0
    WHERE agent_id = _agent_id AND status = 'paused';
END; $$;

-- Admin/service helper: pause active subscriptions for an auto-paused agent,
-- and return rows that were just paused so the caller can email each buyer.
CREATE OR REPLACE FUNCTION public.pause_subscriptions_for_agent(_agent_id uuid)
RETURNS TABLE(subscription_id uuid, buyer_id uuid, buyer_email text, agent_name text, seller_handle text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH paused AS (
    UPDATE public.subscriptions s
       SET status = 'paused'
     WHERE s.agent_id = _agent_id AND s.status = 'active'
     RETURNING s.id, s.buyer_id
  )
  SELECT p.id, p.buyer_id, pr.email, a.name, sp.handle
  FROM paused p
  JOIN public.profiles pr ON pr.id = p.buyer_id
  JOIN public.agents a ON a.id = _agent_id
  JOIN public.seller_profiles sp ON sp.id = a.seller_id;
END; $$;

-- Admin/service helper: list subscriptions just reactivated for emailing.
CREATE OR REPLACE FUNCTION public.list_reactivated_subscribers(_agent_id uuid)
RETURNS TABLE(buyer_email text, agent_name text, seller_handle text)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT pr.email, a.name, sp.handle
  FROM public.subscriptions s
  JOIN public.profiles pr ON pr.id = s.buyer_id
  JOIN public.agents a ON a.id = s.agent_id
  JOIN public.seller_profiles sp ON sp.id = a.seller_id
  WHERE s.agent_id = _agent_id AND s.status = 'active';
$$;