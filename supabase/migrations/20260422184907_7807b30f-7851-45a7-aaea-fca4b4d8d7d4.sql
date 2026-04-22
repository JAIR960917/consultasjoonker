-- Tabela de cache de consultas Serasa (compartilhada entre empresas)
CREATE TABLE public.consultas_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf TEXT NOT NULL UNIQUE,
  nome TEXT,
  data_nascimento DATE,
  score INTEGER,
  raw JSONB,
  pendencias JSONB DEFAULT '[]'::jsonb,
  total_pendencias INTEGER DEFAULT 0,
  soma_pendencias NUMERIC DEFAULT 0,
  consultado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expira_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '3 months'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_consultas_cache_cpf ON public.consultas_cache(cpf);
CREATE INDEX idx_consultas_cache_expira_em ON public.consultas_cache(expira_em);

ALTER TABLE public.consultas_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultas_cache_select_authenticated"
ON public.consultas_cache FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "consultas_cache_insert_authenticated"
ON public.consultas_cache FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "consultas_cache_update_authenticated"
ON public.consultas_cache FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "consultas_cache_admin_delete"
ON public.consultas_cache FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_consultas_cache_updated_at
BEFORE UPDATE ON public.consultas_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();