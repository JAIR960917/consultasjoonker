// Edge Function: assertiva-update-credentials
// Atualiza os secrets ASSERTIVA_CLIENT_ID_<SLUG> e ASSERTIVA_CLIENT_SECRET_<SLUG>
// usando a Management API do Supabase. Requer SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ ok: false, error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ ok: false, error: "Apenas admins" }, 403);

    const body = (await req.json().catch(() => ({}))) as {
      empresa_slug?: string;
      client_id?: string;
      client_secret?: string;
    };

    const slug = body.empresa_slug?.trim();
    const clientId = body.client_id?.trim();
    const clientSecret = body.client_secret?.trim();

    if (!slug) return json({ ok: false, error: "empresa_slug é obrigatório" }, 400);
    if (!clientId || !clientSecret) {
      return json({ ok: false, error: "client_id e client_secret são obrigatórios" }, 400);
    }

    const accessToken = Deno.env.get("SUPABASE_ACCESS_TOKEN");
    const projectRef = Deno.env.get("SUPABASE_PROJECT_REF");
    if (!accessToken || !projectRef) {
      return json(
        {
          ok: false,
          error:
            "Secrets SUPABASE_ACCESS_TOKEN e/ou SUPABASE_PROJECT_REF não configurados. Adicione-os para usar este recurso.",
        },
        500,
      );
    }

    const suffix = slug.toUpperCase();
    const secrets = [
      { name: `ASSERTIVA_CLIENT_ID_${suffix}`, value: clientId },
      { name: `ASSERTIVA_CLIENT_SECRET_${suffix}`, value: clientSecret },
    ];

    const url = `https://api.supabase.com/v1/projects/${projectRef}/secrets`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(secrets),
    });

    const responseText = await r.text();
    if (!r.ok) {
      return json(
        {
          ok: false,
          error: `Falha na Management API (${r.status})`,
          detail: responseText.slice(0, 500),
        },
        500,
      );
    }

    return json({
      ok: true,
      empresa_slug: slug,
      updated: secrets.map((s) => s.name),
      message: "Credenciais atualizadas. Aguarde alguns segundos para a propagação e rode o diagnóstico.",
    });
  } catch (err) {
    console.error("assertiva-update-credentials error", err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, _status = 200) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
