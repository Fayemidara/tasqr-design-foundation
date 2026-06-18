
-- Bump total_earnings when transaction is confirmed/held
CREATE OR REPLACE FUNCTION public.confirm_transaction(_tx_id uuid, _paystack_reference text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _tx public.transactions;
BEGIN
  IF _paystack_reference IS NULL OR length(_paystack_reference) < 1 OR length(_paystack_reference) > 200 THEN
    RAISE EXCEPTION 'invalid_reference';
  END IF;
  SELECT * INTO _tx FROM public.transactions WHERE id = _tx_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'tx_not_found'; END IF;
  IF _tx.buyer_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _tx.status <> 'pending' THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  UPDATE public.transactions SET status = 'held', paystack_reference = _paystack_reference WHERE id = _tx_id;
  UPDATE public.seller_profiles
    SET total_earnings = COALESCE(total_earnings, 0) + COALESCE(_tx.seller_earnings, 0)
    WHERE id = _tx.seller_id;
END;
$function$;

-- Dynamic withdrawable balance calculation
CREATE OR REPLACE FUNCTION public.get_withdrawable_balance(_seller_profile_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(seller_earnings), 0)::numeric
  FROM public.transactions
  WHERE seller_id = _seller_profile_id
    AND status = 'held'
    AND hold_until IS NOT NULL
    AND hold_until < now();
$function$;

-- Friday payouts: >= 20
CREATE OR REPLACE FUNCTION public.admin_list_friday_payouts()
 RETURNS TABLE(seller_id uuid, handle text, airtm_email text, amount numeric, transaction_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT sp.id, sp.handle, sp.airtm_email,
         COALESCE(SUM(t.seller_earnings), 0)::numeric,
         COUNT(t.id)
  FROM public.seller_profiles sp
  JOIN public.transactions t ON t.seller_id = sp.id
  WHERE public.is_admin()
    AND t.status = 'held'
    AND t.hold_until IS NOT NULL
    AND t.hold_until < now()
    AND sp.airtm_email IS NOT NULL
  GROUP BY sp.id, sp.handle, sp.airtm_email
  HAVING COALESCE(SUM(t.seller_earnings), 0) >= 20
  ORDER BY COALESCE(SUM(t.seller_earnings), 0) DESC;
$function$;

-- Mark paid no longer mutates total_earnings or withdrawable_balance
CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(_tx_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tx public.transactions;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO _tx FROM public.transactions WHERE id = _tx_id;
  IF NOT FOUND OR _tx.status <> 'held' THEN RETURN; END IF;
  UPDATE public.transactions SET status = 'released' WHERE id = _tx_id;
END;
$function$;
