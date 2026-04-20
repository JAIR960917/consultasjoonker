-- Permitir que admins excluam vendas
CREATE POLICY "vendas_admin_delete"
ON public.vendas
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));