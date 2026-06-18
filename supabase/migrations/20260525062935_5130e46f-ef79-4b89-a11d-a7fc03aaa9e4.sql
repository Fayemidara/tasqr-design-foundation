
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS paused_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agents_set_updated_at ON public.agents;
CREATE TRIGGER agents_set_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Update reliability score function to set paused_reason when system pauses
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
    UPDATE public.agents
      SET status = 'paused', paused_reason = 'low_reliability'
      WHERE id = _agent_id AND status = 'live';
  END IF;

  SELECT AVG(reliability_score) INTO _avg FROM public.agents WHERE seller_id = _seller_id;
  UPDATE public.seller_profiles SET reliability_score = COALESCE(_avg, 100) WHERE id = _seller_id;

  RETURN _score;
END;
$function$;

-- Admin: list system-paused agents
CREATE OR REPLACE FUNCTION public.admin_list_system_paused_agents()
 RETURNS TABLE(
   agent_id uuid,
   agent_name text,
   seller_handle text,
   seller_email text,
   reliability_score numeric,
   failure_rate numeric,
   dispute_rate numeric,
   paused_at timestamptz
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH stats AS (
    SELECT
      a.id AS aid,
      COUNT(r.id) AS total,
      COUNT(*) FILTER (WHERE r.status IN ('timeout','unreachable','error','malformed')) AS failures,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.disputes d WHERE d.run_id = r.id)) AS disputes
    FROM public.agents a
    LEFT JOIN public.runs r ON r.agent_id = a.id AND r.created_at >= now() - interval '30 days'
    WHERE a.status = 'paused' AND a.paused_reason = 'low_reliability'
    GROUP BY a.id
  )
  SELECT
    a.id,
    a.name,
    sp.handle,
    p.email,
    a.reliability_score,
    CASE WHEN s.total > 0 THEN (s.failures::numeric / s.total) * 100 ELSE 0 END,
    CASE WHEN s.total > 0 THEN (s.disputes::numeric / s.total) * 100 ELSE 0 END,
    a.updated_at
  FROM public.agents a
  JOIN public.seller_profiles sp ON sp.id = a.seller_id
  JOIN public.profiles p ON p.id = sp.user_id
  JOIN stats s ON s.aid = a.id
  WHERE a.status = 'paused' AND a.paused_reason = 'low_reliability'
  ORDER BY a.updated_at DESC;
END;
$function$;

-- Admin: restore a single system-paused agent
CREATE OR REPLACE FUNCTION public.admin_restore_agent(_agent_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _seller_id uuid; _avg numeric;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.agents
    SET status = 'live', paused_reason = NULL, reliability_score = 100
    WHERE id = _agent_id
    RETURNING seller_id INTO _seller_id;
  IF _seller_id IS NOT NULL THEN
    SELECT AVG(reliability_score) INTO _avg FROM public.agents WHERE seller_id = _seller_id;
    UPDATE public.seller_profiles SET reliability_score = COALESCE(_avg, 100) WHERE id = _seller_id;
  END IF;
END;
$function$;
