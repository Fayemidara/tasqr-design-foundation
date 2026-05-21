-- Allow buyers to insert their own pending transactions
CREATE POLICY "Buyers insert own transactions"
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = buyer_id);

-- Allow buyers to update their own transactions (e.g. pending -> held / cancelled)
CREATE POLICY "Buyers update own transactions"
ON public.transactions
FOR UPDATE
TO authenticated
USING (auth.uid() = buyer_id)
WITH CHECK (auth.uid() = buyer_id);