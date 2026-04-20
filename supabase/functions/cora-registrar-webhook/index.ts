// Edge Function: cora-registrar-webhook
// Registra o webhook do nosso sistema na Cora via API POST /endpoints/.
// A Cora NÃO tem painel para configurar webhooks — é feito 100% via API.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CORA_TOKEN_URL = "https://matls-clients.api.cora.com.br/token";
const CORA_ENDPOINTS_URL = "https://matls-clients.api.cora.com.br/endpoints/";

// URL do nosso webhook que receberá as notificações
const WEBHOOK_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/cora-webhook`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    // Apenas admins
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (!roles?.some((r) => r.role === "admin")) {
      return json({ error: "Apenas administradores" }, 403);
    }

    // Body opcional: { triggers?: string[] } — defaults: paid, canceled, overdue
    let triggers: string[] = ["paid", "canceled", "overdue"];
    try {
      const body = await req.json();
      if (Array.isArray(body?.triggers) && body.triggers.length) triggers = body.triggers;
    } catch {
      // sem body, usa defaults
    }

    // Carrega secrets mTLS
    const clientId = Deno.env.get("CORA_CLIENT_ID");
    const certPem = Deno.env.get("CORA_CERTIFICATE");
    const keyPem = Deno.env.get("CORA_PRIVATE_KEY");
    if (!clientId || !certPem || !keyPem) {
      return json({ error: "Secrets da Cora não configurados" }, 400);
    }

    const certCandidates = buildPemCandidates(certPem, "CERTIFICATE");
    const keyCandidates = buildPemCandidates(keyPem, "PRIVATE KEY");
    let client: Deno.HttpClient | null = null;
    let lastErr = "";
    outer: for (const cert of certCandidates) {
      for (const key of keyCandidates) {
        try {
          client = Deno.createHttpClient({ cert, key });
          break outer;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
        }
      }
    }
    if (!client) {
      return json({ error: "Falha ao carregar certificado/chave mTLS", detail: lastErr }, 500);
    }

    // 1) Obter token
    const tokenResp = await fetch(CORA_TOKEN_URL, {
      method: "POST",
      // @ts-ignore
      client,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId }),
    });
    if (!tokenResp.ok) {
      const t = await tokenResp.text();
      return json({ error: "Falha auth Cora", status: tokenResp.status, body: t }, 502);
    }
    const tokenJson = await tokenResp.json();
    const accessToken = tokenJson.access_token as string;

    // 2) Para cada trigger, registra um endpoint
    const results: Array<Record<string, unknown>> = [];
    for (const trigger of triggers) {
      const idempotencyKey = crypto.randomUUID();
      const resp = await fetch(CORA_ENDPOINTS_URL, {
        method: "POST",
        // @ts-ignore
        client,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          url: WEBHOOK_URL,
          resource: "invoice",
          trigger,
        }),
      });
      const text = await resp.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      results.push({
        trigger,
        ok: resp.ok,
        status: resp.status,
        response: parsed,
      });
    }

    return json({
      ok: results.every((r) => r.ok),
      webhook_url: WEBHOOK_URL,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildPemCandidates(raw: string, label: "CERTIFICATE" | "PRIVATE KEY"): string[] {
  const candidates = new Set<string>();
  const add = (s: string) => { if (s && s.includes("-----BEGIN")) candidates.add(s.endsWith("\n") ? s : s + "\n"); };

  const normalized = raw.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
  add(normalized);
  add(raw.trim());

  const stripped = normalized
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (stripped.length > 100) {
    const lines: string[] = [];
    for (let i = 0; i < stripped.length; i += 64) lines.push(stripped.slice(i, i + 64));
    add(`-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`);
    if (label === "PRIVATE KEY") {
      add(`-----BEGIN RSA PRIVATE KEY-----\n${lines.join("\n")}\n-----END RSA PRIVATE KEY-----\n`);
    }
  }

  return Array.from(candidates);
}
