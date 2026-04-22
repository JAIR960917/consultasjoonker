// Edge Function: assertiva-registrar-webhook
// Registra (ou atualiza) o webhook desta aplicação na Assertiva Autentica para
// receber notificações de finalização dos pedidos de assinatura.
//
// Doc: https://integracao.assertivasolucoes.com.br/v3/doc/#tag/Webhooks/paths/~1v1~1jornadas~1webhooks/post
// Endpoint Assertiva: POST/GET/PUT/DELETE  https://api.assertivasolucoes.com.br/autentica/v1/jornadas/webhooks
//
// Body opcional:
//   { empresa_slug?: string, action?: "register"|"list"|"delete", id?: string }
// - action default = "register" (cria ou atualiza pela URL)
// - action="list"  -> lista os webhooks existentes na conta da empresa
// - action="delete"-> remove uma configuração (precisa de id)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASSERTIVA_BASE = "https://api.assertivasolucoes.com.br";
const AUTH_BASE = `${ASSERTIVA_BASE}/autentica`;

interface BodyInput {
  empresa_slug?: string;
  action?: "register" | "list" | "delete";
  id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ ok: false, error: "Sessão inválida" }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Apenas admin pode mexer em webhooks
    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ ok: false, error: "Apenas administradores" }, 403);

    const body = (await req.json().catch(() => ({}))) as BodyInput;
    const action = body.action ?? "register";
    const slug = (body.empresa_slug ?? "").trim();
    const suffix = slug ? `_${slug.toUpperCase()}` : "";

    // ---------- Credenciais ----------
    const clientId = Deno.env.get(`ASSERTIVA_CLIENT_ID${suffix}`) ?? Deno.env.get("ASSERTIVA_CLIENT_ID");
    const clientSecret = Deno.env.get(`ASSERTIVA_CLIENT_SECRET${suffix}`) ?? Deno.env.get("ASSERTIVA_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return json({
        ok: false,
        error: `Credenciais Assertiva não configuradas (ASSERTIVA_CLIENT_ID${suffix} / ASSERTIVA_CLIENT_SECRET${suffix}).`,
      }, 500);
    }

    // ---------- OAuth2 ----------
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
    const tokenJson = safeJson(tokenText);
    if (!tokenResp.ok || !tokenJson?.access_token) {
      console.error("Assertiva OAuth error", tokenResp.status, tokenText.slice(0, 300));
      return json({
        ok: false,
        error: tokenJson?.error_description || `Falha OAuth (HTTP ${tokenResp.status})`,
      }, 502);
    }
    const bearer = tokenJson.access_token as string;

    const authedFetch = (path: string, init: RequestInit = {}) =>
      fetch(`${AUTH_BASE}${path}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${bearer}`,
          Accept: "application/json",
        },
      });

    // ---------- LIST ----------
    if (action === "list") {
      const r = await authedFetch(`/v1/jornadas/webhooks`);
      const t = await r.text();
      return json({ ok: r.ok, http_status: r.status, data: safeJson(t) ?? t });
    }

    // ---------- DELETE ----------
    if (action === "delete") {
      if (!body.id) return json({ ok: false, error: "id obrigatório para delete" }, 400);
      const r = await authedFetch(`/v1/jornadas/webhooks/${body.id}`, { method: "DELETE" });
      const t = await r.text();
      return json({ ok: r.ok, http_status: r.status, data: safeJson(t) ?? t });
    }

    // ---------- REGISTER (POST ou PUT se já existir com mesma URL) ----------
    // URL do nosso receptor — inclui slug para que o assertiva-webhook saiba qual empresa
    const receptorUrl = `${supabaseUrl}/functions/v1/assertiva-webhook${slug ? `?slug=${encodeURIComponent(slug)}` : ""}`;

    // Header simples de identificação (a Assertiva chama nosso endpoint com este Authorization)
    // Não obrigamos validação no receptor, mas mantemos por consistência.
    const secretValue = `Bearer crediflow-${slug || "global"}`;

    const payload = {
      url: receptorUrl,
      secret: secretValue,
      headersCustomizados: [
        { chave: "X-Source", valor: "crediflow" },
        ...(slug ? [{ chave: "X-Empresa-Slug", valor: slug }] : []),
      ],
    };

    // Lista existentes para detectar duplicado pela URL
    const listResp = await authedFetch(`/v1/jornadas/webhooks`);
    const listJson = safeJson(await listResp.text());
    const existing: Array<{ id: string; configuracao?: { url?: string } }> =
      Array.isArray(listJson?.configuracoes) ? listJson.configuracoes : [];
    const found = existing.find((c) => (c?.configuracao?.url ?? "").startsWith(receptorUrl.split("?")[0]));

    let opResp: Response;
    let mode: "created" | "updated";
    if (found?.id) {
      mode = "updated";
      opResp = await authedFetch(`/v1/jornadas/webhooks/${found.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      mode = "created";
      opResp = await authedFetch(`/v1/jornadas/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    const opText = await opResp.text();
    const opJson = safeJson(opText);

    // Caso idempotente: a Assertiva responde 400 quando já existe webhook com a mesma URL.
    // Tratamos como sucesso (já está configurado).
    const messages: string[] = Array.isArray(opJson?.messages) ? opJson.messages : [];
    const jaExiste = opResp.status === 400 &&
      messages.some((m) => typeof m === "string" && m.toLowerCase().includes("já existe"));
    if (jaExiste) {
      return json({
        ok: true,
        mode: "already_exists",
        receptor_url: receptorUrl,
        message: messages[0] ?? "Webhook já configurado para esta URL.",
        detail: opJson,
      });
    }

    if (!opResp.ok) {
      console.error("Assertiva webhook op error", opResp.status, opText.slice(0, 500));
      return json({
        ok: false,
        mode,
        http_status: opResp.status,
        error: opJson?.message || opJson?.error || messages[0] || `HTTP ${opResp.status}`,
        detail: opJson ?? opText.slice(0, 500),
      }, 200);
    }

    return json({
      ok: true,
      mode,
      receptor_url: receptorUrl,
      response: opJson ?? opText,
    });
  } catch (err) {
    console.error("assertiva-registrar-webhook error", err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeJson(text: string): any | null {
  try { return JSON.parse(text); } catch { return null; }
}
