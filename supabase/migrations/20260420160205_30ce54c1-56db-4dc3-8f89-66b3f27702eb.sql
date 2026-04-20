-- ============ PARCELAS ============
CREATE TABLE public.parcelas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  venda_id UUID NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  contrato_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,

  numero_parcela INTEGER NOT NULL,
  total_parcelas INTEGER NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  vencimento DATE NOT NULL,

  status TEXT NOT NULL DEFAULT 'pendente',
  -- pendente | emitido | pago | vencido | cancelado | erro

  -- Cora
  cora_invoice_id TEXT,
  linha_digitavel TEXT,
  codigo_barras TEXT,
  pdf_url TEXT,
  pix_qrcode TEXT,
  pix_emv TEXT,

  emitido_em TIMESTAMPTZ,
  pago_em TIMESTAMPTZ,
  valor_pago NUMERIC(12,2),

  erro_mensagem TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (venda_id, numero_parcela)
);

CREATE INDEX idx_parcelas_venda ON public.parcelas(venda_id);
CREATE INDEX idx_parcelas_user ON public.parcelas(user_id);
CREATE INDEX idx_parcelas_status ON public.parcelas(status);
CREATE INDEX idx_parcelas_vencimento ON public.parcelas(vencimento);
CREATE INDEX idx_parcelas_cora_invoice ON public.parcelas(cora_invoice_id);

ALTER TABLE public.parcelas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parcelas_select_own_or_admin"
  ON public.parcelas FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "parcelas_insert_self"
  ON public.parcelas FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "parcelas_update_own_or_admin"
  ON public.parcelas FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_parcelas_updated_at
  BEFORE UPDATE ON public.parcelas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CORA WEBHOOK LOGS ============
CREATE TABLE public.cora_webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  cora_invoice_id TEXT,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cora_logs_invoice ON public.cora_webhook_logs(cora_invoice_id);
CREATE INDEX idx_cora_logs_event ON public.cora_webhook_logs(event_type);
CREATE INDEX idx_cora_logs_created ON public.cora_webhook_logs(created_at DESC);

ALTER TABLE public.cora_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cora_logs_admin_select"
  ON public.cora_webhook_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
-- Inserts são feitos pela service role (edge function), que ignora RLS.