CREATE POLICY "contracts_admin_delete"
ON public.contracts
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "parcelas_admin_delete"
ON public.parcelas
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));