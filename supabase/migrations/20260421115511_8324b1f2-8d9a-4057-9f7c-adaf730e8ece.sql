-- Tabela de relatórios diários de boletos pagos
CREATE TABLE public.relatorios_diarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data_referencia DATE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pendente',
  total_pagamentos INTEGER NOT NULL DEFAULT 0,
  valor_total NUMERIC NOT NULL DEFAULT 0,
  pagamentos JSONB NOT NULL DEFAULT '[]'::jsonb,
  concluido_por UUID,
  concluido_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.relatorios_diarios ENABLE ROW LEVEL SECURITY;

-- Admin e gerente podem ver
CREATE POLICY "relatorios_select_admin_gerente"
ON public.relatorios_diarios
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'gerente'::app_role)
);

-- Admin e gerente podem atualizar (marcar como concluído)
CREATE POLICY "relatorios_update_admin_gerente"
ON public.relatorios_diarios
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'gerente'::app_role)
);

-- Apenas admin pode deletar
CREATE POLICY "relatorios_delete_admin"
ON public.relatorios_diarios
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Insert apenas via service role (edge function), nenhuma policy para usuários

-- Trigger para updated_at
CREATE TRIGGER update_relatorios_diarios_updated_at
BEFORE UPDATE ON public.relatorios_diarios
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Habilita pg_cron e pg_net para o agendamento
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;