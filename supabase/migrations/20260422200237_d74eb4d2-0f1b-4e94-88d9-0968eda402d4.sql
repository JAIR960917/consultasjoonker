
-- ============================================================
-- 1) consultas_cache: restringir acesso (continha CPF, score, pendências)
-- ============================================================
DROP POLICY IF EXISTS consultas_cache_select_authenticated ON public.consultas_cache;
DROP POLICY IF EXISTS consultas_cache_insert_authenticated ON public.consultas_cache;
DROP POLICY IF EXISTS consultas_cache_update_authenticated ON public.consultas_cache;
DROP POLICY IF EXISTS consultas_cache_admin_delete ON public.consultas_cache;

-- Apenas admins leem o cache diretamente. Edge functions usam service_role e ignoram RLS.
CREATE POLICY consultas_cache_select_admin
  ON public.consultas_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY consultas_cache_admin_delete
  ON public.consultas_cache FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- INSERT/UPDATE: bloqueados para clientes; só service_role (edge functions) escreve.

-- ============================================================
-- 2) relatorios_diarios: adicionar policy de INSERT
-- ============================================================
CREATE POLICY relatorios_insert_admin_or_same_empresa
  ON public.relatorios_diarios FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'gerente') AND empresa_id = public.current_user_empresa_id())
  );

-- ============================================================
-- 3) vendas: adicionar policy de UPDATE explícita (admin only)
-- ============================================================
CREATE POLICY vendas_update_admin
  ON public.vendas FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 4) consultas: bloquear UPDATE/DELETE explicitamente (apenas admin pode deletar)
-- ============================================================
CREATE POLICY consultas_admin_delete
  ON public.consultas FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
-- UPDATE permanece sem policy (bloqueado por padrão), por design (auditoria).

-- ============================================================
-- 5) user_roles: trigger anti auto-atribuição de role
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_self_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bloqueia que o próprio usuário insira/altere/delete sua própria role
  -- (mesmo sendo admin), evitando autoescalação ou autodemotion acidental.
  IF NEW.user_id = auth.uid() THEN
    RAISE EXCEPTION 'Não é permitido modificar a própria role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_role_assignment_trg ON public.user_roles;
CREATE TRIGGER prevent_self_role_assignment_trg
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_assignment();

-- ============================================================
-- 6) Storage bucket "branding": impedir listagem pública,
--    permitindo apenas leitura direta de arquivo conhecido
-- ============================================================
-- Marca bucket como NÃO público (obriga uso de signedUrls ou policy específica)
UPDATE storage.buckets SET public = true WHERE id = 'branding';
-- Mantemos public=true porque o frontend usa URL pública do logo,
-- mas removemos qualquer policy que permita LISTAGEM do bucket.

-- Remove policies amplas existentes no bucket branding
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (policyname ILIKE '%branding%' OR qual ILIKE '%branding%' OR with_check ILIKE '%branding%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- SELECT público apenas para arquivos conhecidos (sem permitir listagem genérica)
CREATE POLICY "branding_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');

-- INSERT/UPDATE/DELETE no bucket branding: só admins
CREATE POLICY "branding_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "branding_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "branding_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));
