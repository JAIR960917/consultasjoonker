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

    // Tenta extrair id externo e status do documento (varia por versão da Assertiva)
    const externalId = payload?.id ?? payload?.documento?.id ?? payload?.data?.id ?? null;
    const status = (payload?.status ?? payload?.documento?.status ?? payload?.evento ?? "").toString().toUpperCase();

    if (!externalId) {
      console.warn("Webhook Assertiva sem id de documento", payload);
      return json({ ok: true, ignored: true, reason: "sem id" });
    }

    // Busca contrato pelo external id
    const { data: contrato } = await admin
      .from("contracts")
      .select("id, status")
      .eq("signature_external_id", String(externalId))
      .maybeSingle();

    if (!contrato) {
      console.warn("Contrato não encontrado para external_id", externalId);
      return json({ ok: true, ignored: true, reason: "contrato não encontrado" });
    }

    // Determina se foi assinado
    const assinado = ["FINALIZADO", "ASSINADO", "CONCLUIDO", "COMPLETED", "SIGNED"].some(
      (s) => status.includes(s),
    );

    if (assinado) {
      await admin.from("contracts").update({
        status: "assinado",
        signed_at: new Date().toISOString(),
        signature_data: payload,
      }).eq("id", contrato.id);
      return json({ ok: true, contrato_id: contrato.id, status: "assinado" });
    }

    // Caso seja outro evento (visualizado, recusado, etc.) só guardamos o payload
    await admin.from("contracts").update({
      signature_data: payload,
    }).eq("id", contrato.id);

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
