-- Fix 1: Hide reviews.buyer_id from public/authenticated readers via column-level grants.
-- The "Reviews are viewable by everyone" policy stays, but anon/authenticated can no longer SELECT buyer_id.
REVOKE SELECT (buyer_id) ON public.reviews FROM anon, authenticated;

-- Fix 2: Lock down the run-outputs storage bucket — no direct client writes.
-- Only service_role (server-side) may write. Buyers may still read their own files via existing select policy.
DROP POLICY IF EXISTS "run_outputs_no_client_insert" ON storage.objects;
CREATE POLICY "run_outputs_no_client_insert"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id <> 'run-outputs');

DROP POLICY IF EXISTS "run_outputs_no_client_update" ON storage.objects;
CREATE POLICY "run_outputs_no_client_update"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id <> 'run-outputs')
  WITH CHECK (bucket_id <> 'run-outputs');

DROP POLICY IF EXISTS "run_outputs_no_client_delete" ON storage.objects;
CREATE POLICY "run_outputs_no_client_delete"
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id <> 'run-outputs');