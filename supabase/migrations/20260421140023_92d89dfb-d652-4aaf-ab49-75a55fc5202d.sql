-- 1. Tabela empresas
CREATE TABLE public.empresas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT NOT NULL UNIQUE,
  cidade TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Slug deve ser uppercase A-Z 0-9 _ (usado em nomes de secrets)
ALTER TABLE public.empresas
  ADD CONSTRAINT empresas_slug_format CHECK (slug ~ '^[A-Z0-9_]+$');

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresas_select_authenticated"
  ON public.empresas FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "empresas_admin_insert"
  ON public.empresas FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "empresas_admin_update"
  ON public.empresas FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "empresas_admin_delete"
  ON public.empresas FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_empresas_updated_at
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. empresa_id nas tabelas relacionadas
ALTER TABLE public.profiles            ADD COLUMN empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL;
ALTER TABLE public.vendas              ADD COLUMN empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL;
ALTER TABLE public.contracts           ADD COLUMN empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL;
ALTER TABLE public.parcelas            ADD COLUMN empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL;
ALTER TABLE public.relatorios_diarios  ADD COLUMN empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

CREATE INDEX idx_profiles_empresa           ON public.profiles(empresa_id);
CREATE INDEX idx_vendas_empresa             ON public.vendas(empresa_id);
CREATE INDEX idx_contracts_empresa          ON public.contracts(empresa_id);
CREATE INDEX idx_parcelas_empresa           ON public.parcelas(empresa_id);
CREATE INDEX idx_relatorios_diarios_empresa ON public.relatorios_diarios(empresa_id);

-- 3. Chave única do relatório diário passa a ser (data_referencia, empresa_id)
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.relatorios_diarios'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE 'ALTER TABLE public.relatorios_diarios DROP CONSTRAINT ' || quote_ident(c);
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.relatorios_diarios_data_referencia_key;

CREATE UNIQUE INDEX relatorios_diarios_data_empresa_unique
  ON public.relatorios_diarios(data_referencia, empresa_id);

-- 4. Função helper: pega empresa_id do usuário logado
CREATE OR REPLACE FUNCTION public.current_user_empresa_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- 5. Atualiza policies do relatório diário: gerente só vê da própria empresa
DROP POLICY IF EXISTS "relatorios_select_admin_gerente" ON public.relatorios_diarios;
DROP POLICY IF EXISTS "relatorios_update_admin_gerente" ON public.relatorios_diarios;

CREATE POLICY "relatorios_select_admin_or_same_empresa"
  ON public.relatorios_diarios FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'gerente'::app_role)
      AND empresa_id = public.current_user_empresa_id()
    )
  );

CREATE POLICY "relatorios_update_admin_or_same_empresa"
  ON public.relatorios_diarios FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'gerente'::app_role)
      AND empresa_id = public.current_user_empresa_id()
    )
  );

-- 6. handle_new_user passa a aceitar empresa_id no metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, cidade, empresa_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'cidade', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'empresa_id', '')::uuid
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'gerente');
  RETURN NEW;
END;
$$;