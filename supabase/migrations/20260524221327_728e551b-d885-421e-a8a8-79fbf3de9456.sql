DROP FUNCTION IF EXISTS public.calculate_reliability_score(uuid, uuid);
DROP FUNCTION IF EXISTS public.calculate_reliability_score(uuid);

CREATE OR REPLACE FUNCTION public.calculate_reliability_score(_agent_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _seller_id uuid;
  _total int;
  _failures int;
  _disputes int;
  _failure_rate numeric;
  _dispute_rate numeric;
  _failure_deduction int;
  _dispute_deduction int;
  _score numeric;
  _avg numeric;
BEGIN
  SELECT seller_id INTO _seller_id FROM public.agents WHERE id = _agent_id;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE r.status IN ('timeout','unreachable','error','malformed')),
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.disputes d WHERE d.run_id = r.id))
  INTO _total, _failures, _disputes
  FROM public.runs r
  WHERE r.agent_id = _agent_id
    AND r.created_at >= now() - interval '30 days';

  IF _total = 0 THEN
    UPDATE public.agents SET reliability_score = 100 WHERE id = _agent_id;
    SELECT AVG(reliability_score) INTO _avg FROM public.agents WHERE seller_id = _seller_id;
    UPDATE public.seller_profiles SET reliability_score = COALESCE(_avg, 100) WHERE id = _seller_id;
    RETURN 100;
  END IF;

  _failure_rate := (_failures::numeric / _total) * 100;
  _dispute_rate := (_disputes::numeric / _total) * 100;

  IF _failure_rate > 75 THEN _failure_deduction := 70;
  ELSIF _failure_rate > 50 THEN _failure_deduction := 50;
  ELSIF _failure_rate > 25 THEN _failure_deduction := 30;
  ELSIF _failure_rate > 10 THEN _failure_deduction := 15;
  ELSE _failure_deduction := 0;
  END IF;

  IF _dispute_rate > 30 THEN _dispute_deduction := 40;
  ELSIF _dispute_rate > 15 THEN _dispute_deduction := 25;
  ELSIF _dispute_rate > 5 THEN _dispute_deduction := 15;
  ELSE _dispute_deduction := 0;
  END IF;

  _score := GREATEST(0, LEAST(100, 100 - _failure_deduction - _dispute_deduction));

  UPDATE public.agents SET reliability_score = _score WHERE id = _agent_id;

  IF _score < 50 THEN
    UPDATE public.agents SET status = 'paused'
      WHERE id = _agent_id AND status = 'live';
  END IF;

  SELECT AVG(reliability_score) INTO _avg FROM public.agents WHERE seller_id = _seller_id;
  UPDATE public.seller_profiles SET reliability_score = COALESCE(_avg, 100) WHERE id = _seller_id;

  RETURN _score;
END;
$function$;

CREATE OR REPLACE FUNCTION public.raise_dispute(_run_id uuid, _reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  PERFORM public.calculate_reliability_score(_run.agent_id);

  RETURN _dispute_id;
END;
$function$;