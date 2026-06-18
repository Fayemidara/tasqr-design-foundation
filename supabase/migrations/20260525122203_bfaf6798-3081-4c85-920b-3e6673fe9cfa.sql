
DROP FUNCTION IF EXISTS public.admin_list_pending_refunds();
CREATE OR REPLACE FUNCTION public.admin_list_pending_refunds()
 RETURNS TABLE(id uuid, paystack_reference text, amount numeric, buyer_id uuid, buyer_email text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.id, t.paystack_reference, t.amount, t.buyer_id, p.email, t.created_at
  FROM public.transactions t
  LEFT JOIN public.profiles p ON p.id = t.buyer_id
  WHERE public.is_admin()
    AND t.status = 'refunded'
    AND t.refunded_at IS NULL
  ORDER BY t.created_at DESC;
$function$;
