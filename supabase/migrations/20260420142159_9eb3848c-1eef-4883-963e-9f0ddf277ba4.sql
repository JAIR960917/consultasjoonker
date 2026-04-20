-- Adiciona campos para textos editáveis da tela de login no branding
ALTER TABLE public.branding
  ADD COLUMN IF NOT EXISTS login_title text NOT NULL DEFAULT 'Aprovação de crédito em segundos.',
  ADD COLUMN IF NOT EXISTS login_subtitle text NOT NULL DEFAULT 'Consulte CPF, calcule entrada e parcelas com base em regras inteligentes que você mesmo configura.',
  ADD COLUMN IF NOT EXISTS login_badge text NOT NULL DEFAULT 'Dados protegidos por autenticação e papéis',
  ADD COLUMN IF NOT EXISTS login_tagline text NOT NULL DEFAULT 'Crédito inteligente';