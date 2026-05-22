-- Dispute window on transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS dispute_window_ends timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_window_closed boolean NOT NULL DEFAULT false;

-- Allow sellers to view disputes against their agents
DROP POLICY IF EXISTS "Sellers view disputes for own agents" ON public.disputes;
CREATE POLICY "Sellers view disputes for own agents"
ON public.disputes
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.runs r
  JOIN public.agents a ON a.id = r.agent_id
  WHERE r.id = disputes.run_id
    AND public.is_seller_owner(a.seller_id)
));

-- Admin helper based on JWT email
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() ->> 'email') = 'ajayifayemidara@gmail.com', false);
$$;

-- Update trigger_refund: allow admin to call; do NOT set refunded_at
-- (refunded_at is reserved as the "manually processed via Paystack" marker)
CREATE OR REPLACE FUNCTION public.trigger_refund(_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tx public.transactions;
BEGIN
  SELECT * INTO _tx FROM public.transactions WHERE id = _transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;

  IF auth.uid() IS NOT NULL
     AND _tx.buyer_id <> auth.uid()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _tx.status = 'refunded' THEN
    RETURN;
  END IF;

  UPDATE public.transactions
    SET status = 'refunded'
    WHERE id = _transaction_id;

  IF _tx.transaction_type = 'subscription' THEN
    UPDATE public.subscriptions
      SET status = 'cancelled'
      WHERE transaction_id = _transaction_id;
  END IF;
END;
$$;

-- Admin: list-style RPCs (read elevated rows)
CREATE OR REPLACE FUNCTION public.admin_list_open_disputes()
RETURNS TABLE (
  id uuid,
  buyer_id uuid,
  agent_name text,
  reason text,
  created_at timestamptz,
  run_id uuid,
  transaction_id uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.buyer_id, a.name, d.reason, d.created_at, r.id, r.transaction_id
  FROM public.disputes d
  JOIN public.runs r ON r.id = d.run_id
  JOIN public.agents a ON a.id = r.agent_id
  WHERE public.is_admin() AND d.status = 'open'
  ORDER BY d.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_pending_refunds()
RETURNS TABLE (
  id uuid,
  paystack_reference text,
  amount numeric,
  buyer_id uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.paystack_reference, t.amount, t.buyer_id, t.created_at
  FROM public.transactions t
  WHERE public.is_admin()
    AND t.status = 'refunded'
    AND t.refunded_at IS NULL
  ORDER BY t.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_friday_payouts()
RETURNS TABLE (
  seller_id uuid,
  handle text,
  airtm_email text,
  amount numeric,
  transaction_count bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.id, sp.handle, sp.airtm_email,
         COALESCE(SUM(t.seller_earnings), 0)::numeric,
         COUNT(t.id)
  FROM public.seller_profiles sp
  JOIN public.transactions t ON t.seller_id = sp.id
  WHERE public.is_admin()
    AND t.status = 'held'
    AND t.hold_until IS NOT NULL
    AND t.hold_until < now()
    AND sp.airtm_email IS NOT NULL
  GROUP BY sp.id, sp.handle, sp.airtm_email
  HAVING COALESCE(SUM(t.seller_earnings), 0) > 20
  ORDER BY COALESCE(SUM(t.seller_earnings), 0) DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_low_reliability()
RETURNS TABLE (
  id uuid,
  handle text,
  reliability_score numeric,
  timeout_rate numeric,
  error_rate numeric,
  dispute_rate numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  WITH stats AS (
    SELECT sp.id AS sid,
           sp.handle,
           sp.reliability_score,
           COUNT(r.id) AS total,
           COUNT(*) FILTER (WHERE r.status IN ('timeout','unreachable')) AS timeouts,
           COUNT(*) FILTER (WHERE r.status = 'error') AS errors,
           COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.disputes d WHERE d.run_id = r.id)) AS disputes
    FROM public.seller_profiles sp
    LEFT JOIN public.agents a ON a.seller_id = sp.id
    LEFT JOIN public.runs r ON r.agent_id = a.id AND r.created_at >= now() - interval '30 days'
    WHERE sp.reliability_score < 70
    GROUP BY sp.id, sp.handle, sp.reliability_score
  )
  SELECT s.sid, s.handle, s.reliability_score,
    CASE WHEN s.total > 0 THEN (s.timeouts::numeric / s.total) * 100 ELSE 0 END,
    CASE WHEN s.total > 0 THEN (s.errors::numeric   / s.total) * 100 ELSE 0 END,
    CASE WHEN s.total > 0 THEN (s.disputes::numeric / s.total) * 100 ELSE 0 END
  FROM stats s
  ORDER BY s.reliability_score ASC;
END;
$$;

-- Admin: actions
CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(_dispute_id uuid, _action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _d public.disputes;
  _tx_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO _d FROM public.disputes WHERE id = _dispute_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT transaction_id INTO _tx_id FROM public.runs WHERE id = _d.run_id;

  IF _action = 'refund' THEN
    UPDATE public.disputes SET status = 'resolved' WHERE id = _dispute_id;
    IF _tx_id IS NOT NULL THEN
      PERFORM public.trigger_refund(_tx_id);
    END IF;
  ELSIF _action = 'reject' THEN
    UPDATE public.disputes SET status = 'rejected' WHERE id = _dispute_id;
    IF _tx_id IS NOT NULL THEN
      UPDATE public.transactions SET status = 'held' WHERE id = _tx_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_action';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_refund_processed(_tx_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.transactions
    SET refunded_at = now()
    WHERE id = _tx_id AND status = 'refunded';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(_tx_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tx public.transactions;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO _tx FROM public.transactions WHERE id = _tx_id;
  IF NOT FOUND OR _tx.status <> 'held' THEN RETURN; END IF;
  UPDATE public.transactions SET status = 'released' WHERE id = _tx_id;
  UPDATE public.seller_profiles
    SET withdrawable_balance = COALESCE(withdrawable_balance, 0) + COALESCE(_tx.seller_earnings, 0)
    WHERE id = _tx.seller_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_seller_batch_paid(_seller_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tx record;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  FOR _tx IN
    SELECT id FROM public.transactions
    WHERE seller_id = _seller_id
      AND status = 'held'
      AND hold_until IS NOT NULL
      AND hold_until < now()
  LOOP
    PERFORM public.admin_mark_payout_paid(_tx.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_restore_seller_agents(_seller_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.agents SET status = 'live'
    WHERE seller_id = _seller_id AND status = 'paused';
END;
$$;