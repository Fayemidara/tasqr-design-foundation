
-- Add payout audit trail columns
ALTER TABLE public.seller_profiles
  ADD COLUMN IF NOT EXISTS total_paid_out numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_paid_out_at timestamptz;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS paid_out_at timestamptz;

-- Refund deduction
CREATE OR REPLACE FUNCTION public.trigger_refund(_transaction_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tx public.transactions;
BEGIN
  SELECT * INTO _tx FROM public.transactions WHERE id = _transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;

  IF auth.uid() IS NOT NULL
     AND _tx.buyer_id <> auth.uid()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _tx.status = 'refunded' THEN
    RETURN;
  END IF;

  UPDATE public.transactions
    SET status = 'refunded'
    WHERE id = _transaction_id;

  -- Deduct seller earnings (floor at 0)
  UPDATE public.seller_profiles
    SET total_earnings = GREATEST(0, COALESCE(total_earnings, 0) - COALESCE(_tx.seller_earnings, 0))
    WHERE id = _tx.seller_id;

  IF _tx.transaction_type = 'subscription' THEN
    UPDATE public.subscriptions
      SET status = 'cancelled'
      WHERE transaction_id = _transaction_id;
  END IF;
END;
$function$;

-- Payout: stamp paid_out_at and accumulate
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
  UPDATE public.transactions
    SET status = 'released', paid_out_at = now()
    WHERE id = _tx_id;
  UPDATE public.seller_profiles
    SET total_paid_out = COALESCE(total_paid_out, 0) + COALESCE(_tx.seller_earnings, 0),
        last_paid_out_at = now()
    WHERE id = _tx.seller_id;
END;
$function$;
