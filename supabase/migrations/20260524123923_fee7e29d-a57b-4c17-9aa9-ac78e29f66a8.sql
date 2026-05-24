
-- 1) Remove public read on run-uploads storage bucket
DROP POLICY IF EXISTS "Public read run-uploads" ON storage.objects;

-- 2) Lock down SECURITY DEFINER admin functions: revoke from PUBLIC/anon, grant only to authenticated
--    (Each admin_* function internally enforces is_admin())
REVOKE EXECUTE ON FUNCTION public.admin_list_friday_payouts()                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_low_reliability()               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_open_disputes()                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_pending_refunds()               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_mark_refund_processed(uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_mark_seller_batch_paid(uuid)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_dispute(uuid, text)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_restore_seller_agents(uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin()                                 FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_list_friday_payouts()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_low_reliability()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_open_disputes()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_refunds()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_refund_processed(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_seller_batch_paid(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_dispute(uuid, text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_seller_agents(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()                                  TO authenticated;

-- Also lock down sensitive non-admin definer functions from anon
REVOKE EXECUTE ON FUNCTION public.trigger_refund(uuid)                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.calculate_reliability_score(uuid)          FROM PUBLIC, anon;
