-- Add refunded_at column to transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- trigger_refund: marks a transaction as refunded and cancels a linked subscription if any.
-- Security: SECURITY DEFINER so it can update rows regardless of RLS, but verifies
-- the caller is the buyer who owns the transaction. Service role bypasses this check.
CREATE OR REPLACE FUNCTION public.trigger_refund(_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tx public.transactions;
BEGIN
  SELECT * INTO _tx FROM public.transactions WHERE id = _transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;

  IF auth.uid() IS NOT NULL AND _tx.buyer_id <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _tx.status = 'refunded' THEN
    RETURN;
  END IF;

  UPDATE public.transactions
    SET status = 'refunded', refunded_at = now()
    WHERE id = _transaction_id;

  IF _tx.transaction_type = 'subscription' THEN
    UPDATE public.subscriptions
      SET status = 'cancelled'
      WHERE transaction_id = _transaction_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_refund(uuid) TO authenticated;