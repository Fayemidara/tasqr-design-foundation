CREATE OR REPLACE FUNCTION public.calculate_reliability_score(_seller_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _total int;
  _timeouts int;
  _errors int;
  _malformed int;
  _disputes int;
  _timeout_rate numeric;
  _error_rate numeric;
  _dispute_rate numeric;
  _deduction int := 0;
  _score numeric;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE r.status IN ('timeout', 'unreachable')),
    COUNT(*) FILTER (WHERE r.status = 'error'),
    COUNT(*) FILTER (WHERE r.status = 'malformed'),
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.disputes d WHERE d.run_id = r.id))
  INTO _total, _timeouts, _errors, _malformed, _disputes
  FROM public.runs r
  JOIN public.agents a ON a.id = r.agent_id
  WHERE a.seller_id = _seller_id
    AND r.created_at >= now() - interval '30 days';

  IF _total = 0 THEN
    UPDATE public.seller_profiles SET reliability_score = 100 WHERE id = _seller_id;
    RETURN 100;
  END IF;

  _timeout_rate := (_timeouts::numeric / _total) * 100;
  _error_rate := (_errors::numeric / _total) * 100;
  _dispute_rate := (_disputes::numeric / _total) * 100;

  IF _timeout_rate > 30 THEN _deduction := _deduction + 40;
  ELSIF _timeout_rate > 15 THEN _deduction := _deduction + 25;
  ELSIF _timeout_rate > 5 THEN _deduction := _deduction + 10;
  END IF;

  IF _error_rate > 50 THEN _deduction := _deduction + 35;
  ELSIF _error_rate > 25 THEN _deduction := _deduction + 20;
  ELSIF _error_rate > 10 THEN _deduction := _deduction + 10;
  END IF;

  IF _malformed > 10 THEN _deduction := _deduction + 25;
  ELSIF _malformed > 3 THEN _deduction := _deduction + 15;
  ELSIF _malformed >= 1 THEN _deduction := _deduction + 5;
  END IF;

  IF _dispute_rate > 5 THEN _deduction := _deduction + 20;
  ELSIF _dispute_rate > 2 THEN _deduction := _deduction + 10;
  END IF;

  _score := GREATEST(0, 100 - _deduction);

  UPDATE public.seller_profiles SET reliability_score = _score WHERE id = _seller_id;

  IF _score < 50 THEN
    UPDATE public.agents SET status = 'paused'
      WHERE seller_id = _seller_id AND status = 'live';
  END IF;

  RETURN _score;
END;
$function$;