// Edge Function: assertiva-autentica-diag
// Diagnóstico do produto Assertiva Autentica.
// Testa múltiplas combinações de endpoint/grant_type e devolve o resultado bruto.

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
    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ ok: false, error: "Apenas admins" }, 403);

    const clientId = Deno.env.get("ASSERTIVA_CLIENT_ID");
    const clientSecret = Deno.env.get("ASSERTIVA_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return json({
        ok: false,
        error: "Credenciais Assertiva não configuradas (ASSERTIVA_CLIENT_ID / ASSERTIVA_CLIENT_SECRET).",
      }, 400);
    }

    const safeId = `${clientId.slice(0, 4)}...${clientId.slice(-4)} (len=${clientId.length})`;
    const basic = "Basic " + btoa(`${clientId}:${clientSecret}`);

    // Testa várias variações
    const attempts: any[] = [];
    const variants = [
      { url: `${ASSERTIVA_BASE}/oauth2/v3/token`, body: "grant_type=client_credentials", auth: "basic" },
      { url: `${ASSERTIVA_BASE}/oauth2/v3/token`, body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`, auth: "body" },
      { url: `${ASSERTIVA_BASE}/v3/token`, body: "grant_type=client_credentials", auth: "basic" },
    ];

    for (const v of variants) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        };
        if (v.auth === "basic") headers.Authorization = basic;

        const r = await fetch(v.url, { method: "POST", headers, body: v.body });
        const txt = await r.text();
        let parsed: any = null;
        try { parsed = JSON.parse(txt); } catch {}
        attempts.push({
          url: v.url,
          auth_mode: v.auth,
          http_status: r.status,
          ok: r.ok,
          response_headers: Object.fromEntries(r.headers.entries()),
          response_body: parsed ?? txt.slice(0, 1000),
          access_token_present: !!parsed?.access_token,
        });
      } catch (e) {
        attempts.push({ url: v.url, auth_mode: v.auth, error: String(e) });
      }
    }

    return json({
      ok: true,
      empresa_slug: slug,
      secret_suffix: suffix,
      client_id_preview: safeId,
      attempts,
      diagnostico: attempts.some((a) => a.access_token_present)
        ? "✅ Pelo menos uma variação funcionou — copie a URL/auth dessa attempt"
        : "❌ Todas as variações retornaram erro. Encaminhe esse JSON inteiro para o suporte da Assertiva.",
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
