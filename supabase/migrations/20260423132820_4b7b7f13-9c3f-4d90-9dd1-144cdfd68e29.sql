DROP POLICY IF EXISTS consultas_cache_select_admin ON public.consultas_cache;

CREATE POLICY consultas_cache_select_authenticated
ON public.consultas_cache
FOR SELECT
TO authenticated
USING (true);