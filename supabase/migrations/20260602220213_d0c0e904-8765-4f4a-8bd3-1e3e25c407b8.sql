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
  _current numeric;
  _restored_at timestamptz;
  _window_start timestamptz;
BEGIN
  SELECT seller_id, reliability_score, restored_at
    INTO _seller_id, _current, _restored_at
    FROM public.agents WHERE id = _agent_id;

  _window_start := GREATEST(
    now() - interval '30 days',
    COALESCE(_restored_at, now() - interval '30 days')
  );

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE r.status IN ('timeout','unreachable','error','malformed')),
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.disputes d
      WHERE d.run_id = r.id AND d.created_at > _window_start
    ))
  INTO _total, _failures, _disputes
  FROM public.runs r
  WHERE r.agent_id = _agent_id
    AND r.created_at > _window_start
    AND r.status IN ('success','timeout','unreachable','error','malformed');

  IF _total < 3 THEN
    RETURN _current;
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
    UPDATE public.agents
      SET status = 'paused', paused_reason = 'low_reliability'
      WHERE id = _agent_id AND status = 'live';
  END IF;

  SELECT AVG(reliability_score) INTO _avg FROM public.agents WHERE seller_id = _seller_id;
  UPDATE public.seller_profiles SET reliability_score = COALESCE(_avg, 100) WHERE id = _seller_id;

  RETURN _score;
END;
$function$;