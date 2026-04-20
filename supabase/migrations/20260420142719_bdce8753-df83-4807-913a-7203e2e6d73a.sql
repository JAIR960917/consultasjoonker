ALTER TABLE public.branding
  ADD COLUMN IF NOT EXISTS sidebar_primary text NOT NULL DEFAULT '152 76% 44%',
  ADD COLUMN IF NOT EXISTS sidebar_primary_foreground text NOT NULL DEFAULT '222 70% 12%',
  ADD COLUMN IF NOT EXISTS primary_glow text NOT NULL DEFAULT '222 70% 28%';