// Edge Function: cora-auth-test
// Testa autenticação mTLS + OAuth2 (client_credentials) com a API da Cora.
// Retorna sucesso/erro e metadados do token (sem expor o access_token completo).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CORA_TOKEN_URL = "https://matls-clients.api.cora.com.br/token";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth do usuário (apenas usuários logados podem testar)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(
      token,
    );
    if (claimsErr || !claims?.claims) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Carrega secrets
    const clientId = Deno.env.get("CORA_CLIENT_ID");
    const certPem = Deno.env.get("CORA_CERTIFICATE");
    const keyPem = Deno.env.get("CORA_PRIVATE_KEY");

    const missing: string[] = [];
    if (!clientId) missing.push("CORA_CLIENT_ID");
    if (!certPem) missing.push("CORA_CERTIFICATE");
    if (!keyPem) missing.push("CORA_PRIVATE_KEY");
    if (missing.length) {
      return json(
        { ok: false, error: `Secrets ausentes: ${missing.join(", ")}` },
        400,
      );
    }

    // Validação mínima do formato PEM
    const certOk = certPem!.includes("BEGIN CERTIFICATE");
    const keyOk = keyPem!.includes("BEGIN") && keyPem!.includes("PRIVATE KEY");
    if (!certOk || !keyOk) {
      return json(
        {
          ok: false,
          error:
            "Formato PEM inválido. CORA_CERTIFICATE deve conter 'BEGIN CERTIFICATE' e CORA_PRIVATE_KEY deve conter 'BEGIN PRIVATE KEY'.",
          cert_ok: certOk,
          key_ok: keyOk,
        },
        400,
      );
    }

    // Cria cliente Deno com mTLS
    const client = Deno.createHttpClient({
      cert: certPem!,
      key: keyPem!,
    });

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId!,
    });

    const started = Date.now();
    const resp = await fetch(CORA_TOKEN_URL, {
      method: "POST",
      // @ts-ignore - client é suportado pelo Deno runtime
      client,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
    const elapsedMs = Date.now() - started;

    const text = await resp.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      // resposta não-JSON
    }

    if (!resp.ok) {
      console.error("Cora auth failed", {
        status: resp.status,
        body: text.slice(0, 500),
      });
      return json(
        {
          ok: false,
          status: resp.status,
          elapsed_ms: elapsedMs,
          error:
            parsed?.error_description ||
            parsed?.error ||
            text.slice(0, 300) ||
            "Falha na autenticação com a Cora",
          raw: parsed,
        },
        200,
      );
    }

    const accessToken: string | undefined = parsed?.access_token;
    const expiresIn: number | undefined = parsed?.expires_in;
    const tokenType: string | undefined = parsed?.token_type;
    const scope: string | undefined = parsed?.scope;

    // Mascarar token
    const masked = accessToken
      ? `${accessToken.slice(0, 6)}...${accessToken.slice(-6)} (${accessToken.length} chars)`
      : null;

    return json({
      ok: true,
      message: "Autenticação com a Cora bem-sucedida! ✅",
      elapsed_ms: elapsedMs,
      token_type: tokenType,
      expires_in: expiresIn,
      scope,
      access_token_preview: masked,
    });
  } catch (err) {
    console.error("cora-auth-test error", err);
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: msg }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
