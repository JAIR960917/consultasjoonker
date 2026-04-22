// Edge Function: assertiva-autentica-diag
// Diagnóstico do produto Assertiva Autentica.
// Lista fluxos ativos e perfis de assinatura disponíveis para a empresa.
//
// Body: { empresa_slug?: string }  (opcional — usa secrets globais se não passar)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASSERTIVA_BASE = "https://api.assertivasolucoes.com.br";

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

    // Apenas admins
    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ ok: false, error: "Apenas admins" }, 403);

    const body = (await req.json().catch(() => ({}))) as { empresa_slug?: string };
    const slug = body.empresa_slug?.trim() || null;
    const suffix = slug ? `_${slug.toUpperCase()}` : "";

    const clientId =
      Deno.env.get(`ASSERTIVA_CLIENT_ID${suffix}`) ?? Deno.env.get("ASSERTIVA_CLIENT_ID");
    const clientSecret =
      Deno.env.get(`ASSERTIVA_CLIENT_SECRET${suffix}`) ?? Deno.env.get("ASSERTIVA_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return json({
        ok: false,
        error: `Credenciais não encontradas. Verifique ASSERTIVA_CLIENT_ID${suffix} e ASSERTIVA_CLIENT_SECRET${suffix}.`,
      }, 400);
    }

    // 1) Token — endpoint correto confirmado pelo suporte Assertiva
    const tokenResp = await fetch(`${ASSERTIVA_BASE}/oauth2/v3/token`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });
    const tokenText = await tokenResp.text();
    let tokenJson: any = null;
    try { tokenJson = JSON.parse(tokenText); } catch {}

    if (!tokenResp.ok || !tokenJson?.access_token) {
      return json({
        ok: false,
        step: "token",
        http_status: tokenResp.status,
        body: tokenText.slice(0, 800),
        hint: "Se 401: verifique client_id/secret. Se 403: as credenciais não têm acesso ao Autentica.",
      }, 200);
    }
    const bearer = tokenJson.access_token as string;

    // 2) Fluxos ativos
    const fluxosResp = await fetch(`${ASSERTIVA_BASE}/v1/jornadas/fluxos/ativos`, {
      headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
    });
    const fluxosText = await fluxosResp.text();
    let fluxosJson: any = null;
    try { fluxosJson = JSON.parse(fluxosText); } catch {}

    // 3) Perfis de assinatura
    const perfisResp = await fetch(`${ASSERTIVA_BASE}/v1/jornadas/perfis-assinatura`, {
      headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
    });
    const perfisText = await perfisResp.text();
    let perfisJson: any = null;
    try { perfisJson = JSON.parse(perfisText); } catch {}

    return json({
      ok: true,
      empresa_slug: slug,
      auth: { ok: true, expires_in: tokenJson.expires_in },
      fluxos: {
        http_status: fluxosResp.status,
        ok: fluxosResp.ok,
        data: fluxosJson ?? fluxosText.slice(0, 500),
      },
      perfis_assinatura: {
        http_status: perfisResp.status,
        ok: perfisResp.ok,
        data: perfisJson ?? perfisText.slice(0, 500),
      },
      diagnostico: {
        autentica_ativo: fluxosResp.ok && perfisResp.ok,
        observacao:
          fluxosResp.status === 403 || perfisResp.status === 403
            ? "403 nos endpoints de jornadas — plano Autentica não inclui o módulo de Jornadas. Contate suporte Assertiva."
            : (Array.isArray(fluxosJson?.resposta) && fluxosJson.resposta.length === 0) ||
              (Array.isArray(fluxosJson) && fluxosJson.length === 0)
            ? "Sem fluxos cadastrados — peça ao suporte Assertiva para criar um fluxo de Assinatura via WhatsApp."
            : "OK — copie os UUIDs de fluxoId e perfilId.",
      },
    });
  } catch (err) {
    console.error("assertiva-autentica-diag error", err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, _status = 200) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
