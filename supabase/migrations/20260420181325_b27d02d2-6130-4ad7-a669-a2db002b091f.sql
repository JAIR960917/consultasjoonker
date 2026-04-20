-- 1) Renomear o valor do enum operador -> gerente
ALTER TYPE public.app_role RENAME VALUE 'operador' TO 'gerente';

-- 2) Adicionar coluna cidade em profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cidade text NOT NULL DEFAULT '';

-- 3) Atualizar a função do trigger para usar 'gerente'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, cidade)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'cidade', '')
  );

  -- papel padrão: gerente
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'gerente');

  RETURN NEW;
END;
$function$;