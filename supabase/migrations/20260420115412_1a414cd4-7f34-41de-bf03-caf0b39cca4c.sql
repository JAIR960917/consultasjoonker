ALTER TABLE public.contract_template
  ADD COLUMN IF NOT EXISTS company_cnpj text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_address text NOT NULL DEFAULT '';