-- Tabela do modelo de contrato (singleton, editado pelo admin)
CREATE TABLE public.contract_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Contrato de Prestação de Serviços',
  company_name text NOT NULL DEFAULT 'Empresa',
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY contract_template_select_authenticated
ON public.contract_template FOR SELECT TO authenticated USING (true);

CREATE POLICY contract_template_admin_insert
ON public.contract_template FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY contract_template_admin_update
ON public.contract_template FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER contract_template_updated_at
BEFORE UPDATE ON public.contract_template
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Linha inicial padrão
INSERT INTO public.contract_template (title, company_name, content) VALUES (
  'Contrato de Prestação de Serviços',
  'Sua Empresa',
  E'CONTRATANTE: {{nome}}, inscrito(a) no CPF nº {{cpf}}, residente em {{endereco}}, telefone {{telefone}}.\n\nCONTRATADO: {{empresa}}.\n\nAs partes têm justo e contratado o seguinte:\n\nCLÁUSULA PRIMEIRA – Do objeto\nO presente contrato tem por objeto a venda no valor total de R$ {{valor_total}}, com entrada de R$ {{valor_entrada}} e {{parcelas}} parcelas de R$ {{valor_parcela}}.\n\nCLÁUSULA SEGUNDA – Da forma de pagamento\nAs parcelas serão pagas mensalmente conforme acordado.\n\nE por estarem assim justas e contratadas, as partes assinam o presente.\n\nData: {{data}}'
);

-- Tabela de contratos gerados
CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  venda_id uuid REFERENCES public.vendas(id) ON DELETE SET NULL,
  consulta_id uuid REFERENCES public.consultas(id) ON DELETE SET NULL,
  cpf text NOT NULL,
  nome text NOT NULL,
  endereco text NOT NULL,
  telefone text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  signature_provider text,
  signature_external_id text,
  signature_url text,
  signed_at timestamptz,
  signature_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY contracts_select_own_or_admin
ON public.contracts FOR SELECT TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY contracts_insert_self
ON public.contracts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY contracts_update_own_or_admin
ON public.contracts FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER contracts_updated_at
BEFORE UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_contracts_user_id ON public.contracts(user_id);
CREATE INDEX idx_contracts_venda_id ON public.contracts(venda_id);