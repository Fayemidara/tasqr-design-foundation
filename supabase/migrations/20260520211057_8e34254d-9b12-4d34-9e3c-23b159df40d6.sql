
-- Storage bucket for run input file uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('run-uploads', 'run-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: any authenticated user can upload into their own folder; public read
CREATE POLICY "Public read run-uploads"
ON storage.objects FOR SELECT
USING (bucket_id = 'run-uploads');

CREATE POLICY "Authenticated upload run-uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'run-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owners update run-uploads"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'run-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owners delete run-uploads"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'run-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow buyers to insert and update their own runs
CREATE POLICY "Buyers insert own runs"
ON public.runs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Buyers update own runs"
ON public.runs FOR UPDATE TO authenticated
USING (auth.uid() = buyer_id)
WITH CHECK (auth.uid() = buyer_id);

-- Trigger: after a review is inserted, recompute agent rating + count
CREATE OR REPLACE FUNCTION public.update_agent_review_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agents
  SET
    review_count = (SELECT COUNT(*) FROM public.reviews WHERE agent_id = NEW.agent_id),
    average_rating = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM public.reviews WHERE agent_id = NEW.agent_id), 0)
  WHERE id = NEW.agent_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_update_agent_stats ON public.reviews;
CREATE TRIGGER reviews_update_agent_stats
AFTER INSERT ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.update_agent_review_stats();

-- Trigger: increment agent.run_count when a run transitions to success
CREATE OR REPLACE FUNCTION public.bump_agent_run_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'success' AND (OLD.status IS DISTINCT FROM 'success') THEN
    UPDATE public.agents SET run_count = run_count + 1 WHERE id = NEW.agent_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS runs_bump_agent_run_count ON public.runs;
CREATE TRIGGER runs_bump_agent_run_count
AFTER UPDATE ON public.runs
FOR EACH ROW EXECUTE FUNCTION public.bump_agent_run_count();
