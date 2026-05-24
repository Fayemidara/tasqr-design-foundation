
-- =========================================================
-- 1. seller_profiles: hide sensitive columns from PostgREST
-- =========================================================
REVOKE SELECT (api_key_hash, api_key_prefix, api_key_last_used, airtm_email,
               withdrawable_balance, total_earnings, draft_input_schema)
  ON public.seller_profiles FROM anon, authenticated;

-- Owners must use get_my_seller_profile() (SECURITY DEFINER) for these fields.
GRANT EXECUTE ON FUNCTION public.get_my_seller_profile() TO authenticated;

-- Owner UPDATEs on those columns still need to work (RLS already scopes to owner).
GRANT UPDATE (api_key_hash, api_key_prefix, api_key_last_used, airtm_email,
              withdrawable_balance, total_earnings, draft_input_schema)
  ON public.seller_profiles TO authenticated;

-- =========================================================
-- 2. Drop buyer UPDATE policies; replace with narrow RPCs
-- =========================================================
DROP POLICY IF EXISTS "Buyers update own runs"          ON public.runs;
DROP POLICY IF EXISTS "Buyers update own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Buyers update own transactions"  ON public.transactions;

-- complete_run: buyer finalizes their in-flight run.
CREATE OR REPLACE FUNCTION public.complete_run(
  _run_id              uuid,
  _status              text,
  _output              text    DEFAULT NULL,
  _output_type         text    DEFAULT NULL,
  _error_message       text    DEFAULT NULL,
  _error_code          text    DEFAULT NULL,
  _processing_time_ms  int     DEFAULT NULL,
  _files               jsonb   DEFAULT NULL,
  _subscription_id     uuid    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _run public.runs;
  _tx_id uuid;
BEGIN
  IF _status NOT IN ('success','timeout','unreachable','error','malformed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  SELECT * INTO _run FROM public.runs WHERE id = _run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF _run.buyer_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _run.status NOT IN ('pending','processing','running') THEN
    RAISE EXCEPTION 'already_terminal';
  END IF;

  UPDATE public.runs SET
    status             = _status,
    output             = COALESCE(_output,             output),
    output_type        = COALESCE(_output_type,        output_type),
    error_message      = COALESCE(_error_message,      error_message),
    error_code         = COALESCE(_error_code,         error_code),
    processing_time_ms = COALESCE(_processing_time_ms, processing_time_ms),
    files              = COALESCE(_files,              files)
  WHERE id = _run_id;

  IF _status = 'success' THEN
    _tx_id := _run.transaction_id;
    IF _tx_id IS NULL AND _subscription_id IS NOT NULL THEN
      SELECT s.transaction_id INTO _tx_id
        FROM public.subscriptions s
        WHERE s.id = _subscription_id AND s.buyer_id = auth.uid();
    END IF;
    IF _tx_id IS NOT NULL THEN
      UPDATE public.transactions
        SET dispute_window_ends = now() + interval '48 hours',
            dispute_window_closed = false
        WHERE id = _tx_id AND buyer_id = auth.uid();
    END IF;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.complete_run(uuid, text, text, text, text, text, int, jsonb, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.complete_run(uuid, text, text, text, text, text, int, jsonb, uuid) TO authenticated;

-- confirm_transaction: buyer marks transaction as held after successful Paystack callback.
CREATE OR REPLACE FUNCTION public.confirm_transaction(_tx_id uuid, _paystack_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tx public.transactions;
BEGIN
  IF _paystack_reference IS NULL OR length(_paystack_reference) < 1 OR length(_paystack_reference) > 200 THEN
    RAISE EXCEPTION 'invalid_reference';
  END IF;
  SELECT * INTO _tx FROM public.transactions WHERE id = _tx_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'tx_not_found'; END IF;
  IF _tx.buyer_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _tx.status <> 'pending' THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  UPDATE public.transactions SET status = 'held', paystack_reference = _paystack_reference WHERE id = _tx_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.confirm_transaction(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.confirm_transaction(uuid, text) TO authenticated;

-- cancel_transaction: buyer cancels a still-pending checkout.
CREATE OR REPLACE FUNCTION public.cancel_transaction(_tx_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tx public.transactions;
BEGIN
  SELECT * INTO _tx FROM public.transactions WHERE id = _tx_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'tx_not_found'; END IF;
  IF _tx.buyer_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _tx.status <> 'pending' THEN RETURN; END IF;
  UPDATE public.transactions SET status = 'cancelled' WHERE id = _tx_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancel_transaction(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancel_transaction(uuid) TO authenticated;

-- cancel_subscription: buyer cancels their own subscription.
CREATE OR REPLACE FUNCTION public.cancel_subscription(_sub_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sub public.subscriptions;
BEGIN
  SELECT * INTO _sub FROM public.subscriptions WHERE id = _sub_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sub_not_found'; END IF;
  IF _sub.buyer_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _sub.status = 'cancelled' THEN RETURN; END IF;
  UPDATE public.subscriptions SET status = 'cancelled' WHERE id = _sub_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancel_subscription(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancel_subscription(uuid) TO authenticated;

-- raise_dispute: buyer files a dispute and marks transaction as disputed atomically.
CREATE OR REPLACE FUNCTION public.raise_dispute(_run_id uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _run public.runs; _tx_id uuid; _dispute_id uuid;
BEGIN
  IF _reason IS NULL OR length(btrim(_reason)) < 1 OR length(_reason) > 2000 THEN
    RAISE EXCEPTION 'invalid_reason';
  END IF;
  SELECT * INTO _run FROM public.runs WHERE id = _run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF _run.buyer_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;

  _tx_id := _run.transaction_id;
  IF _tx_id IS NULL THEN
    SELECT s.transaction_id INTO _tx_id
      FROM public.subscriptions s
      WHERE s.buyer_id = auth.uid() AND s.agent_id = _run.agent_id
      ORDER BY s.created_at DESC LIMIT 1;
  END IF;

  IF _tx_id IS NOT NULL THEN
    PERFORM 1 FROM public.transactions
      WHERE id = _tx_id
        AND dispute_window_closed = false
        AND dispute_window_ends IS NOT NULL
        AND dispute_window_ends > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'dispute_window_closed'; END IF;
  END IF;

  INSERT INTO public.disputes (buyer_id, run_id, reason, status)
    VALUES (auth.uid(), _run_id, btrim(_reason), 'open')
    RETURNING id INTO _dispute_id;

  IF _tx_id IS NOT NULL THEN
    UPDATE public.transactions
      SET status = 'disputed', dispute_window_closed = true
      WHERE id = _tx_id;
  END IF;
  RETURN _dispute_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.raise_dispute(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.raise_dispute(uuid, text) TO authenticated;

-- =========================================================
-- 3. Sellers: stop direct reads of full runs rows
-- =========================================================
-- Replace existing seller dispute policy (which joined runs under RLS) with
-- a SECURITY DEFINER helper so we can safely drop seller SELECT on runs.
CREATE OR REPLACE FUNCTION public.is_seller_dispute(_run_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.runs r
    JOIN public.agents a ON a.id = r.agent_id
    WHERE r.id = _run_id AND public.is_seller_owner(a.seller_id)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_seller_dispute(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_seller_dispute(uuid) TO authenticated;

DROP POLICY IF EXISTS "Sellers view disputes for own agents" ON public.disputes;
CREATE POLICY "Sellers view disputes for own agents" ON public.disputes
  FOR SELECT TO authenticated
  USING (public.is_seller_dispute(run_id));

DROP POLICY IF EXISTS "Sellers view runs on own agents" ON public.runs;

-- Replacement RPCs for the seller dashboard:
CREATE OR REPLACE FUNCTION public.get_seller_run_metrics(_seller_id uuid)
RETURNS TABLE(
  total_runs      bigint,
  timeout_count   bigint,
  error_count     bigint,
  malformed_count bigint,
  dispute_count   bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_seller_owner(_seller_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE r.status IN ('timeout','unreachable')),
    COUNT(*) FILTER (WHERE r.status = 'error'),
    COUNT(*) FILTER (WHERE r.status = 'malformed'),
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.disputes d WHERE d.run_id = r.id))
  FROM public.runs r
  JOIN public.agents a ON a.id = r.agent_id
  WHERE a.seller_id = _seller_id
    AND r.created_at >= now() - interval '30 days';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_seller_run_metrics(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_seller_run_metrics(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_seller_open_disputes()
RETURNS TABLE(id uuid, created_at timestamptz, status text, agent_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.created_at, d.status, a.name
  FROM public.disputes d
  JOIN public.runs    r ON r.id = d.run_id
  JOIN public.agents  a ON a.id = r.agent_id
  WHERE d.status = 'open'
    AND public.is_seller_owner(a.seller_id)
  ORDER BY d.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.get_seller_open_disputes() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_seller_open_disputes() TO authenticated;
