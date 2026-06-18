
-- 1. Per-agent reliability score
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS reliability_score numeric NOT NULL DEFAULT 100;

-- Seed existing agents from their seller's current score so first render isn't all-100.
UPDATE public.agents a
SET reliability_score = sp.reliability_score
FROM public.seller_profiles sp
WHERE a.seller_id = sp.id;

-- 2. Rewrite calculate_reliability_score to take seller_id + optional agent_id
DROP FUNCTION IF EXISTS public.calculate_reliability_score(uuid);

CREATE OR REPLACE FUNCTION public.calculate_reliability_score(
  _seller_id uuid,
  _agent_id  uuid DEFAULT NULL
)
RETURNS numeric
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
BEGIN
  IF _agent_id IS NOT NULL THEN
    -- Score one specific agent
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

    IF _total = 0 THEN
      _score := 100;
    ELSE
      _deduction := 0;
      _timeout_rate := (_timeouts::numeric / _total) * 100;
      _error_rate   := (_errors::numeric   / _total) * 100;
      _dispute_rate := (_disputes::numeric / _total) * 100;

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

    UPDATE public.agents SET reliability_score = _score WHERE id = _agent_id;

    IF _score < 50 THEN
      UPDATE public.agents
        SET status = 'paused'
        WHERE id = _agent_id AND status = 'live';
    END IF;
  ELSE
    -- Recalculate every agent for the seller
    FOR _agent IN SELECT id FROM public.agents WHERE seller_id = _seller_id LOOP
      PERFORM public.calculate_reliability_score(_seller_id, _agent.id);
    END LOOP;
  END IF;

  -- Refresh seller-level average from per-agent scores
  SELECT AVG(reliability_score) INTO _avg
  FROM public.agents WHERE seller_id = _seller_id;

  UPDATE public.seller_profiles
    SET reliability_score = COALESCE(_avg, 100)
    WHERE id = _seller_id;

  RETURN COALESCE(_score, COALESCE(_avg, 100));
END;
$function$;

-- 3. Per-agent health metrics for the seller dashboard
CREATE OR REPLACE FUNCTION public.get_agent_health(_seller_id uuid)
RETURNS TABLE(
  agent_id uuid,
  agent_name text,
  status text,
  reliability_score numeric,
  total_runs bigint,
  timeout_rate numeric,
  error_rate numeric,
  malformed_count bigint,
  dispute_rate numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_seller_owner(_seller_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH stats AS (
    SELECT
      a.id   AS aid,
      a.name AS aname,
      a.status AS astatus,
      a.reliability_score AS ascore,
      COUNT(r.id) AS total,
      COUNT(*) FILTER (WHERE r.status IN ('timeout','unreachable')) AS timeouts,
      COUNT(*) FILTER (WHERE r.status = 'error') AS errors,
      COUNT(*) FILTER (WHERE r.status = 'malformed') AS malformed,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.disputes d WHERE d.run_id = r.id)) AS disputes
    FROM public.agents a
    LEFT JOIN public.runs r
      ON r.agent_id = a.id
     AND r.created_at >= now() - interval '30 days'
    WHERE a.seller_id = _seller_id
    GROUP BY a.id, a.name, a.status, a.reliability_score
  )
  SELECT
    s.aid, s.aname, s.astatus, s.ascore, s.total,
    CASE WHEN s.total > 0 THEN (s.timeouts::numeric / s.total) * 100 ELSE 0 END,
    CASE WHEN s.total > 0 THEN (s.errors::numeric   / s.total) * 100 ELSE 0 END,
    s.malformed,
    CASE WHEN s.total > 0 THEN (s.disputes::numeric / s.total) * 100 ELSE 0 END
  FROM stats s
  ORDER BY s.ascore ASC, s.aname ASC;
END;
$function$;
