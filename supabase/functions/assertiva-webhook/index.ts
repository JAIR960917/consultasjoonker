// Edge Function: assertiva-webhook
// Recebe webhooks da Assertiva Assinaturas. Cada empresa configura seu webhook
// na Assertiva passando ?slug=<SLUG_DA_EMPRESA> na URL e o secret
// ASSERTIVA_WEBHOOK_SECRET_<SLUG> é usado para validar a assinatura HMAC do payload.
//
// Quando o documento é assinado, marca o contrato como "assinado".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-assertiva-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug")?.toUpperCase() || null;

    const rawBody = await req.text();
    const signature = req.headers.get("x-assertiva-signature") ?? req.headers.get("X-Assertiva-Signature");

    // Validação HMAC opcional — se a empresa tem secret configurado, validamos.
    const suffix = slug ? `_${slug}` : "";
    const webhookSecret = Deno.env.get(`ASSERTIVA_WEBHOOK_SECRET${suffix}`) ?? Deno.env.get("ASSERTIVA_WEBHOOK_SECRET");
    if (webhookSecret && signature) {
      const valid = await verifyHmac(rawBody, signature, webhookSecret);
      if (!valid) {
        console.warn("Assinatura HMAC inválida para slug:", slug);
        return json({ ok: false, error: "Invalid signature" }, 401);
      }
    }

    let payload: any = null;
    try { payload = JSON.parse(rawBody); } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Payload novo (Assertiva Autentica):
    // { evento, eventoId, dados: { entidade: "PARTE"|"PEDIDO", status, id, protocolo } }
    // Payload antigo (Assertiva Assinaturas) ainda suportado abaixo.
    const dados = payload?.dados ?? null;
    const entidade = String(dados?.entidade ?? "").toUpperCase();
    const statusAutentica = String(dados?.status ?? "").toUpperCase();
    const idAutentica = dados?.id ? String(dados.id) : null;
    const protocoloAutentica = dados?.protocolo ? String(dados.protocolo) : null;

    const externalIdLegacy = payload?.id ?? payload?.documento?.id ?? payload?.data?.id ?? null;
    const statusLegacy = (payload?.status ?? payload?.documento?.status ?? payload?.evento ?? "").toString().toUpperCase();

    const externalId = idAutentica ?? (externalIdLegacy ? String(externalIdLegacy) : null);
    const status = statusAutentica || statusLegacy;

    if (!externalId) {
      console.warn("Webhook Assertiva sem id", payload);
      return json({ ok: true, ignored: true, reason: "sem id" });
    }

    // Busca por id externo (pedidoId), protocolo ou parteId dentro de signature_data
    let contrato: { id: string; status: string } | null = null;
    {
      const { data } = await admin
        .from("contracts")
        .select("id, status")
        .eq("signature_external_id", externalId)
        .maybeSingle();
      contrato = data ?? null;
    }
    if (!contrato && protocoloAutentica) {
      const { data } = await admin
        .from("contracts")
        .select("id, status")
        .eq("signature_external_id", protocoloAutentica)
        .maybeSingle();
      contrato = data ?? null;
    }
    // Fallback: webhook trouxe parteId/eventoId — varre signature_data dos contratos pendentes
    if (!contrato) {
      const candidatos = [externalId, protocoloAutentica].filter(Boolean) as string[];
      const { data: pendentes } = await admin
        .from("contracts")
        .select("id, status, signature_data, signature_external_id")
        .eq("signature_provider", "assertiva-autentica")
        .in("status", ["aguardando_assinatura", "pendente"]);
      for (const c of pendentes ?? []) {
        const sd: any = c.signature_data ?? {};
        const partes: any[] = sd?.data?.partes ?? sd?.partes ?? [];
        const parteIds = partes.map((p) => String(p?.parteId ?? p?.id ?? "")).filter(Boolean);
        const protocolos = partes.map((p) => String(p?.protocolo ?? "")).filter(Boolean);
        const pedidoId = String(sd?.data?.pedidoId ?? sd?.pedidoId ?? "");
        const protocoloPedido = String(sd?.data?.protocolo ?? sd?.protocolo ?? "");
        const todos = new Set([...parteIds, ...protocolos, pedidoId, protocoloPedido, c.signature_external_id ?? ""]);
        if (candidatos.some((x) => todos.has(x))) {
          contrato = { id: c.id, status: c.status };
          break;
        }
      }
    }

    if (!contrato) {
      console.warn("Contrato não encontrado para external_id", externalId, "protocolo", protocoloAutentica);
      return json({ ok: true, ignored: true, reason: "contrato não encontrado" });
    }

    // Sucesso quando entidade=PARTE/PEDIDO finaliza, ou quando legacy reporta assinado
    const sucesso =
      (entidade && ["FINALIZADO", "APROVADO", "COLETADO"].some((s) => statusAutentica.includes(s))) ||
      ["FINALIZADO", "ASSINADO", "CONCLUIDO", "COMPLETED", "SIGNED", "APROVADO"].some((s) => statusLegacy.includes(s));

    if (sucesso) {
      await admin.from("contracts").update({
        status: "assinado",
        signed_at: new Date().toISOString(),
        signature_data: payload,
      }).eq("id", contrato.id);
      return json({ ok: true, contrato_id: contrato.id, status: "assinado" });
    }

    await admin.from("contracts").update({ signature_data: payload }).eq("id", contrato.id);
    return json({ ok: true, contrato_id: contrato.id, evento: status });
  } catch (err) {
    console.error("assertiva-webhook error", err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifyHmac(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const expected = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    const provided = signature.replace(/^sha256=/, "").toLowerCase();
    return expected === provided;
  } catch {
    return false;
  }
}
