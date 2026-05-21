-- Make run-uploads private (was public)
UPDATE storage.buckets SET public = false WHERE id = 'run-uploads';

-- Create private run-outputs bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('run-outputs', 'run-outputs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Drop any pre-existing policies we might be replacing
DROP POLICY IF EXISTS "Public read run uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload run uploads" ON storage.objects;
DROP POLICY IF EXISTS "Owner update run uploads" ON storage.objects;
DROP POLICY IF EXISTS "Owner delete run uploads" ON storage.objects;
DROP POLICY IF EXISTS "run_uploads_select_own" ON storage.objects;
DROP POLICY IF EXISTS "run_uploads_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "run_uploads_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "run_outputs_select_own" ON storage.objects;

-- run-uploads: buyers manage files inside their own {user_id}/... folder
CREATE POLICY "run_uploads_select_own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'run-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "run_uploads_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'run-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "run_uploads_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'run-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- run-outputs: buyers can read their own outputs (so signed URLs resolve);
-- writes happen via service-role server functions only.
CREATE POLICY "run_outputs_select_own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'run-outputs' AND auth.uid()::text = (storage.foldername(name))[1]);
