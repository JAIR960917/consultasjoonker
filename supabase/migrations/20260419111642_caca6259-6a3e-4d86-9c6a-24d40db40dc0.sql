-- Tabela de branding (linha única)
CREATE TABLE public.branding (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  app_name TEXT NOT NULL DEFAULT 'CrediFlow',
  logo_url TEXT,
  -- Cores em HSL string (ex: "222 47% 11%")
  background TEXT NOT NULL DEFAULT '0 0% 100%',
  foreground TEXT NOT NULL DEFAULT '222 47% 11%',
  primary_color TEXT NOT NULL DEFAULT '221 83% 53%',
  primary_foreground TEXT NOT NULL DEFAULT '0 0% 100%',
  secondary TEXT NOT NULL DEFAULT '210 40% 96%',
  secondary_foreground TEXT NOT NULL DEFAULT '222 47% 11%',
  accent TEXT NOT NULL DEFAULT '262 83% 58%',
  accent_foreground TEXT NOT NULL DEFAULT '0 0% 100%',
  muted TEXT NOT NULL DEFAULT '210 40% 96%',
  muted_foreground TEXT NOT NULL DEFAULT '215 16% 47%',
  card TEXT NOT NULL DEFAULT '0 0% 100%',
  card_foreground TEXT NOT NULL DEFAULT '222 47% 11%',
  border TEXT NOT NULL DEFAULT '214 32% 91%',
  sidebar_background TEXT NOT NULL DEFAULT '222 47% 11%',
  sidebar_foreground TEXT NOT NULL DEFAULT '210 40% 98%',
  sidebar_accent TEXT NOT NULL DEFAULT '217 33% 17%',
  sidebar_accent_foreground TEXT NOT NULL DEFAULT '210 40% 98%',
  sidebar_border TEXT NOT NULL DEFAULT '217 33% 17%',
  destructive TEXT NOT NULL DEFAULT '0 84% 60%',
  destructive_foreground TEXT NOT NULL DEFAULT '0 0% 100%',
  success TEXT NOT NULL DEFAULT '142 71% 45%',
  success_foreground TEXT NOT NULL DEFAULT '0 0% 100%',
  warning TEXT NOT NULL DEFAULT '38 92% 50%',
  warning_foreground TEXT NOT NULL DEFAULT '0 0% 10%',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branding_select_all" ON public.branding FOR SELECT USING (true);
CREATE POLICY "branding_admin_insert" ON public.branding FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "branding_admin_update" ON public.branding FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER update_branding_updated_at
BEFORE UPDATE ON public.branding
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Linha inicial
INSERT INTO public.branding (app_name) VALUES ('CrediFlow');

-- Bucket público para a logo
INSERT INTO storage.buckets (id, name, public) VALUES ('branding', 'branding', true);

CREATE POLICY "branding_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'branding');
CREATE POLICY "branding_admin_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND has_role(auth.uid(),'admin'));
CREATE POLICY "branding_admin_update_obj" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND has_role(auth.uid(),'admin'));
CREATE POLICY "branding_admin_delete_obj" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND has_role(auth.uid(),'admin'));