// Edge Function: assertiva-sincronizar-todos
// Roda em cron — varre todos contratos com status "aguardando_assinatura"
// e tenta consultar o status na Assertiva. Se a Assertiva liberar o endpoint
// de consulta, os contratos passam a ser marcados como "assinado" automaticamente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASSERTIVA_BASE = "https://api.assertivasolucoes.com.br";
const AUTH_BASE = `${ASSERTIVA_BASE}/autentica`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: contratos, error } = await admin
      .from("contracts")
      .select("id, status, signature_data")
      .eq("status", "aguardando_assinatura")
      .eq("signature_provider", "assertiva")
      .limit(200);

    if (error) return json({ ok: false, error: error.message }, 500);
    if (!contratos?.length) return json({ ok: true, processados: 0, atualizados: 0 });

    const finalizadoTokens = ["FINALIZADO", "APROVADO", "COLETADO", "CONCLUIDO", "ASSINADO", "COMPLETED", "SIGNED"];
    let atualizados = 0;
    let erros = 0;

    for (const contrato of contratos) {
      const sigData: any = contrato.signature_data ?? {};
      const pedidoId = sigData?.data?.pedidoId ?? sigData?.pedidoId ?? sigData?.data?.id ?? null;
      if (!pedidoId) continue;

      const empresaSlug = String(sigData?.empresa_slug ?? sigData?.empresaSlug ?? "").toUpperCase();
      const suffix = empresaSlug ? `_${empresaSlug}` : "";
      const authTokenSuffix = empresaSlug ? `_${empresaSlug.toLowerCase()}` : "";
      let authHeaderValue =
        Deno.env.get(`ASSERTIVA_AUTH_TOKEN${authTokenSuffix}`) ??
        Deno.env.get(`ASSERTIVA_AUTH_TOKEN${suffix}`) ??
        Deno.env.get("ASSERTIVA_AUTH_TOKEN") ?? "";

      if (!authHeaderValue) {
        const clientId = Deno.env.get(`ASSERTIVA_CLIENT_ID${suffix}`) ?? Deno.env.get("ASSERTIVA_CLIENT_ID");
        const clientSecret = Deno.env.get(`ASSERTIVA_CLIENT_SECRET${suffix}`) ?? Deno.env.get("ASSERTIVA_CLIENT_SECRET");
        if (!clientId || !clientSecret) {
          erros++;
          console.error(`credenciais ausentes para contrato ${contrato.id} (${empresaSlug || "global"})`);
          continue;
        }

        const tokenResp = await fetch(`${ASSERTIVA_BASE}/oauth2/v3/token`, {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: "grant_type=client_credentials",
        });
        const tokenJson = await tokenResp.json().catch(() => ({}));
        if (!tokenResp.ok || !tokenJson?.access_token) {
          erros++;
          console.error(`falha auth assertiva para contrato ${contrato.id}`, tokenJson);
          continue;
        }
        authHeaderValue = `Bearer ${tokenJson.access_token as string}`;
      } else if (!/^[A-Za-z]+\s+.+$/.test(authHeaderValue)) {
        authHeaderValue = `Bearer ${authHeaderValue}`;
      }

      try {
        const r = await fetch(`${AUTH_BASE}/v1/jornadas/pedidos/${pedidoId}`, {
          headers: { Authorization: authHeaderValue, Accept: "application/json" },
        });
        if (!r.ok) {
          erros++;
          console.info(`pedido ${pedidoId} status ${r.status}`);
          continue;
        }
        const pedidoData = await r.json();
        const dados = pedidoData?.data ?? pedidoData;
        const partes: any[] = dados?.partes ?? dados?.pedido?.partes ?? [];
        const statusPedido = String(dados?.status ?? dados?.pedido?.status ?? "").toUpperCase();
        const statusParte = String(partes?.[0]?.status ?? "").toUpperCase();
        const sucesso =
          finalizadoTokens.some((t) => statusPedido.includes(t)) ||
          finalizadoTokens.some((t) => statusParte.includes(t));

        if (sucesso) {
          await admin.from("contracts").update({
            status: "assinado",
            signed_at: new Date().toISOString(),
            signature_data: { ...sigData, sincronizado_em: new Date().toISOString(), pedido_consulta: pedidoData },
          }).eq("id", contrato.id);
          atualizados++;
        }
      } catch (err) {
        erros++;
        console.error(`erro ao processar contrato ${contrato.id}`, err);
      }
    }

    return json({ ok: true, processados: contratos.length, atualizados, erros });
  } catch (err) {
    console.error("assertiva-sincronizar-todos error", err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
