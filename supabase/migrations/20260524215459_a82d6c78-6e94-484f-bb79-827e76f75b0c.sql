DROP FUNCTION IF EXISTS public.calculate_reliability_score(uuid, uuid);

CREATE OR REPLACE FUNCTION public.calculate_reliability_score(_seller_id uuid, _agent_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _agent record;
  _total int;
  _timeouts int;
  _errors int;
  _malformed int;
  _disputes int;
  _timeout_rate numeric;
  _error_rate numeric;
  _dispute_rate numeric;
  _deduction int;
  _score numeric;
  _avg numeric;
  _result jsonb;
BEGIN
  IF _agent_id IS NOT NULL THEN
    RAISE NOTICE '[reliability] agent_id received: %', _agent_id;

    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE r.status IN ('timeout','unreachable')),
      COUNT(*) FILTER (WHERE r.status = 'error'),
      COUNT(*) FILTER (WHERE r.status = 'malformed'),
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.disputes d WHERE d.run_id = r.id))
    INTO _total, _timeouts, _errors, _malformed, _disputes
    FROM public.runs r
    WHERE r.agent_id = _agent_id
      AND r.created_at >= now() - interval '30 days';

    RAISE NOTICE '[reliability] runs in last 30 days for %: total=%', _agent_id, _total;

    _deduction := 0;
    IF _total = 0 THEN
      _score := 100;
      _timeout_rate := 0;
      _error_rate := 0;
      _dispute_rate := 0;
      RAISE NOTICE '[reliability] no runs; defaulting score to 100';
    ELSE
      _timeout_rate := (_timeouts::numeric / _total) * 100;
      _error_rate   := (_errors::numeric   / _total) * 100;
      _dispute_rate := (_disputes::numeric / _total) * 100;

      RAISE NOTICE '[reliability] metrics: timeouts=% (%.2f%%), errors=% (%.2f%%), malformed=%, disputes=% (%.2f%%)',
        _timeouts, _timeout_rate, _errors, _error_rate, _malformed, _disputes, _dispute_rate;

      IF _timeout_rate > 30 THEN _deduction := _deduction + 40;
      ELSIF _timeout_rate > 15 THEN _deduction := _deduction + 25;
      ELSIF _timeout_rate >  5 THEN _deduction := _deduction + 10;
      END IF;

      IF _error_rate > 50 THEN _deduction := _deduction + 35;
      ELSIF _error_rate > 25 THEN _deduction := _deduction + 20;
      ELSIF _error_rate > 10 THEN _deduction := _deduction + 10;
      END IF;

      IF _malformed > 10 THEN _deduction := _deduction + 25;
      ELSIF _malformed >  3 THEN _deduction := _deduction + 15;
      ELSIF _malformed >= 1 THEN _deduction := _deduction + 5;
      END IF;

      IF _dispute_rate > 5 THEN _deduction := _deduction + 20;
      ELSIF _dispute_rate > 2 THEN _deduction := _deduction + 10;
      END IF;

      _score := GREATEST(0, 100 - _deduction);
    END IF;

    RAISE NOTICE '[reliability] final score for %: %', _agent_id, _score;

    UPDATE public.agents SET reliability_score = _score WHERE id = _agent_id;

    IF _score < 50 THEN
      UPDATE public.agents
        SET status = 'paused'
        WHERE id = _agent_id AND status = 'live';
    END IF;

    _result := jsonb_build_object(
      'score', _score,
      'total_runs', _total,
      'timeout_unreachable_count', _timeouts,
      'error_count', _errors,
      'malformed_count', _malformed,
      'dispute_count', _disputes,
      'timeout_rate', _timeout_rate,
      'error_rate', _error_rate,
      'dispute_rate', _dispute_rate,
      'deductions', _deduction
    );
  ELSE
    FOR _agent IN SELECT id FROM public.agents WHERE seller_id = _seller_id LOOP
      PERFORM public.calculate_reliability_score(_seller_id, _agent.id);
    END LOOP;
  END IF;

  SELECT AVG(reliability_score) INTO _avg
  FROM public.agents WHERE seller_id = _seller_id;

  UPDATE public.seller_profiles
    SET reliability_score = COALESCE(_avg, 100)
    WHERE id = _seller_id;

  IF _result IS NULL THEN
    _result := jsonb_build_object('score', COALESCE(_avg, 100), 'seller_average', COALESCE(_avg, 100));
  END IF;

  RETURN _result;
END;
$function$;