// Edge Function: cora-registrar-webhook
// Registra o webhook do nosso sistema na Cora via API POST /endpoints/.
// A Cora NÃO tem painel para configurar webhooks — é feito 100% via API.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CORA_TOKEN_URL = "https://matls-clients.api.cora.com.br/token";
const CORA_ENDPOINTS_URL = "https://matls-clients.api.cora.com.br/endpoints/";

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

    // Normaliza PEMs (lida com \\n escapado)
    const cert = normalizePem(certPem, "CERTIFICATE");
    const key = normalizePem(keyPem, "PRIVATE KEY");

    let httpClient: Deno.HttpClient;
    try {
      httpClient = Deno.createHttpClient({ cert, key });
    } catch (e) {
      return json({
        error: "Falha ao criar cliente mTLS",
        detail: e instanceof Error ? e.message : String(e),
      }, 500);
    }

    // 1) Obter token (com timeout de 20s)
    let accessToken: string;
    try {
      const tokenResp = await fetchWithTimeout(CORA_TOKEN_URL, {
        method: "POST",
        // @ts-ignore
        client: httpClient,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId }),
      }, 20000);

      const tokenText = await tokenResp.text();
      if (!tokenResp.ok) {
        console.error("Cora token error", tokenResp.status, tokenText);
        return json({
          error: "Falha auth Cora (mTLS)",
          status: tokenResp.status,
          body: tokenText,
          hint: "Verifique se CORA_CERTIFICATE e CORA_PRIVATE_KEY estão corretos e homologados em Produção.",
        }, 502);
      }
      accessToken = JSON.parse(tokenText).access_token;
    } catch (e) {
      console.error("Cora token fetch failed", e);
      return json({
        error: "Timeout/erro ao conectar na Cora",
        detail: e instanceof Error ? e.message : String(e),
      }, 504);
    }

    // 2) Para cada trigger, registra um endpoint
    const results: Array<Record<string, unknown>> = [];
    for (const trigger of triggers) {
      try {
        const resp = await fetchWithTimeout(CORA_ENDPOINTS_URL, {
          method: "POST",
          // @ts-ignore
          client: httpClient,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            url: WEBHOOK_URL,
            resource: "invoice",
            trigger,
          }),
        }, 20000);
        const text = await resp.text();
        let parsed: unknown = text;
        try { parsed = JSON.parse(text); } catch { /* keep text */ }
        results.push({ trigger, ok: resp.ok, status: resp.status, response: parsed });
      } catch (e) {
        results.push({
          trigger,
          ok: false,
          status: 0,
          response: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return json({
      ok: results.every((r) => r.ok),
      webhook_url: WEBHOOK_URL,
      results,
    });
  } catch (err) {
    console.error("cora-registrar-webhook fatal", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { client?: Deno.HttpClient },
  ms: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function normalizePem(raw: string, label: "CERTIFICATE" | "PRIVATE KEY"): string {
  let s = raw.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
  if (s.includes("-----BEGIN")) {
    return s.endsWith("\n") ? s : s + "\n";
  }
  // Apenas base64 — reconstrói o PEM
  const b64 = s.replace(/\s+/g, "");
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 64) lines.push(b64.slice(i, i + 64));
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}
