// Edge Function: assertiva-sincronizar-status
// Consulta o status de um pedido na Assertiva Autentica e atualiza o contrato.
// Útil quando o webhook não está configurado / não chegou.
//
// Body: { contrato_id: string }

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
    if (userErr || !userData?.user) return json({ ok: false, error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const contratoId = body?.contrato_id;
    if (!contratoId) return json({ ok: false, error: "contrato_id obrigatório" }, 400);

    const { data: contrato, error: contratoErr } = await admin
      .from("contracts")
      .select("id, user_id, empresa_id, venda_id, status, signature_external_id, signature_data")
      .eq("id", contratoId)
      .maybeSingle();
    if (contratoErr || !contrato) return json({ ok: false, error: "Contrato não encontrado" }, 404);

    // Permissão
    if (contrato.user_id !== userId) {
      const { data: roleRow } = await admin
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleRow) return json({ ok: false, error: "Sem permissão" }, 403);
    }

    // Extrai pedidoId do signature_data
    const sigData: any = contrato.signature_data ?? {};
    const pedidoId =
      sigData?.data?.pedidoId ??
      sigData?.pedidoId ??
      sigData?.data?.id ??
      null;

    if (!pedidoId) {
      return json({ ok: false, error: "Pedido Assertiva não encontrado para este contrato" }, 400);
    }

    // Resolve empresa para pegar credenciais
    let empresaId: string | null = contrato.empresa_id ?? null;
    if (!empresaId && contrato.venda_id) {
      const { data: venda } = await admin
        .from("vendas").select("empresa_id").eq("id", contrato.venda_id).maybeSingle();
      empresaId = venda?.empresa_id ?? null;
    }
    if (!empresaId) {
      const { data: profile } = await admin
        .from("profiles").select("empresa_id").eq("user_id", contrato.user_id).maybeSingle();
      empresaId = profile?.empresa_id ?? null;
    }

    const clientId = Deno.env.get("ASSERTIVA_CLIENT_ID");
    const clientSecret = Deno.env.get("ASSERTIVA_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return json({ ok: false, error: "Credenciais Assertiva não configuradas" }, 500);
    }

    // OAuth2
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
      return json({ ok: false, error: "Falha ao obter token Assertiva", detail: tokenJson }, 502);
    }
    const bearer = tokenJson.access_token as string;

    // Consulta o pedido — tenta endpoints conhecidos da Assertiva Autentica
    const pedidoEndpoints = [
      `/v1/jornadas/pedidos/${pedidoId}`,
      `/v1/jornadas/pedidos/consultar/${pedidoId}`,
      `/v1/jornadas/pedidos?protocolo=${pedidoId}`,
    ];

    let pedidoData: any = null;
    let lastStatus = 0;
    let lastBody = "";
    for (const ep of pedidoEndpoints) {
      const r = await fetch(`${AUTH_BASE}${ep}`, {
        headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
      });
      lastStatus = r.status;
      lastBody = await r.text();
      console.info("autentica: consulta pedido", ep, r.status, lastBody.slice(0, 500));
      if (r.ok) {
        try { pedidoData = JSON.parse(lastBody); } catch { /* ignore */ }
        if (pedidoData) break;
      }
    }

    if (!pedidoData) {
      return json({
        ok: false,
        error: `Falha ao consultar pedido na Assertiva (HTTP ${lastStatus})`,
        detail: lastBody.slice(0, 500),
      }, 502);
    }

    // Extrai status — formatos comuns
    const dados = pedidoData?.data ?? pedidoData;
    const partes: any[] = dados?.partes ?? dados?.pedido?.partes ?? [];
    const statusPedido = String(dados?.status ?? dados?.pedido?.status ?? "").toUpperCase();
    const statusParte = String(partes?.[0]?.status ?? "").toUpperCase();

    const finalizadoTokens = ["FINALIZADO", "APROVADO", "COLETADO", "CONCLUIDO", "ASSINADO", "COMPLETED", "SIGNED"];
    const sucesso =
      finalizadoTokens.some((t) => statusPedido.includes(t)) ||
      finalizadoTokens.some((t) => statusParte.includes(t));

    const mergedSig = { ...(sigData ?? {}), sincronizado_em: new Date().toISOString(), pedido_consulta: pedidoData };

    if (sucesso) {
      await admin.from("contracts").update({
        status: "assinado",
        signed_at: new Date().toISOString(),
        signature_data: mergedSig,
      }).eq("id", contratoId);
      return json({ ok: true, status: "assinado", statusPedido, statusParte });
    }

    await admin.from("contracts").update({ signature_data: mergedSig }).eq("id", contratoId);
    return json({ ok: true, status: contrato.status, statusPedido, statusParte, atualizado: false });
  } catch (err) {
    console.error("assertiva-sincronizar-status error", err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
