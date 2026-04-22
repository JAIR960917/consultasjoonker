// Edge Function: assertiva-baixar-assinado
// Busca o PDF do contrato assinado na Assertiva Autentica e devolve em base64 para download.
// Tenta vários endpoints conhecidos da API e, se possível, salva a URL/base64 em signature_data.
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

    const body = await req.json().catch(() => ({}));
    const contratoId = body?.contrato_id;
    if (!contratoId) return json({ ok: false, error: "contrato_id obrigatório" }, 400);

    const { data: contrato } = await admin
      .from("contracts")
      .select("id, user_id, empresa_id, status, signature_external_id, signature_data, nome")
      .eq("id", contratoId)
      .maybeSingle();
    if (!contrato) return json({ ok: false, error: "Contrato não encontrado" }, 404);

    if (contrato.user_id !== userId) {
      const { data: roleRow } = await admin
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleRow) return json({ ok: false, error: "Sem permissão" }, 403);
    }

    const sigData: any = contrato.signature_data ?? {};
    const pedidoId =
      sigData?.data?.pedidoId ?? sigData?.pedidoId ?? sigData?.dados?.id ?? contrato.signature_external_id;
    if (!pedidoId) return json({ ok: false, error: "pedidoId não encontrado no contrato" }, 400);

    // Slug → credenciais por empresa
    let slug = "";
    if (contrato.empresa_id) {
      const { data: empresa } = await admin
        .from("empresas").select("slug").eq("id", contrato.empresa_id).maybeSingle();
      slug = (empresa?.slug ?? "").toUpperCase();
    }
    const suffix = slug ? `_${slug}` : "";
    const clientId = Deno.env.get(`ASSERTIVA_CLIENT_ID${suffix}`) ?? Deno.env.get("ASSERTIVA_CLIENT_ID");
    const clientSecret = Deno.env.get(`ASSERTIVA_CLIENT_SECRET${suffix}`) ?? Deno.env.get("ASSERTIVA_CLIENT_SECRET");
    if (!clientId || !clientSecret) return json({ ok: false, error: "Credenciais Assertiva não configuradas" }, 500);

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

    // Endpoints possíveis para baixar o PDF assinado / dossiê
    const endpoints = [
      `/v1/jornadas/pedidos/${pedidoId}/documento-assinado`,
      `/v1/jornadas/pedidos/${pedidoId}/documento`,
      `/v1/jornadas/pedidos/${pedidoId}/dossie`,
      `/v1/jornadas/pedidos/${pedidoId}/arquivo-assinado`,
      `/v1/jornadas/pedidos/${pedidoId}/arquivos`,
      `/v1/jornadas/pedidos/${pedidoId}`,
    ];

    let pdfBase64: string | null = null;
    let pdfUrl: string | null = null;
    const tentativas: any[] = [];

    for (const ep of endpoints) {
      try {
        const r = await fetch(`${AUTH_BASE}${ep}`, {
          headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json, application/pdf, */*" },
        });
        const ct = r.headers.get("content-type") ?? "";
        tentativas.push({ ep, status: r.status, contentType: ct });
        console.info("baixar-assinado:", ep, r.status, ct);
        if (!r.ok) continue;

        if (ct.includes("application/pdf")) {
          const buf = new Uint8Array(await r.arrayBuffer());
          pdfBase64 = bytesToBase64(buf);
          break;
        }

        const text = await r.text();
        let parsed: any = null;
        try { parsed = JSON.parse(text); } catch { /* ignore */ }
        if (!parsed) continue;

        // Procura URL de download em campos comuns
        const url = findDownloadUrlDeep(parsed);
        if (url) {
          pdfUrl = url;
          // Tenta baixar o conteúdo (geralmente é S3 pré-assinado, sem autenticação)
          const dl = await fetch(url);
          if (dl.ok) {
            const buf = new Uint8Array(await dl.arrayBuffer());
            pdfBase64 = bytesToBase64(buf);
          }
          break;
        }
      } catch (e) {
        tentativas.push({ ep, error: String(e) });
      }
    }

    if (!pdfBase64 && !pdfUrl) {
      return json({
        ok: false,
        error: "Documento assinado ainda não disponível na Assertiva",
        tentativas,
      });
    }

    // Persiste a URL no signature_data para uso futuro
    const merged = { ...(sigData ?? {}), signed_pdf_url: pdfUrl ?? sigData?.signed_pdf_url, baixado_em: new Date().toISOString() };
    await admin.from("contracts").update({ signature_data: merged }).eq("id", contratoId);

    return json({
      ok: true,
      pdf_base64: pdfBase64,
      pdf_url: pdfUrl,
      filename: `contrato-assinado-${(contrato.nome ?? "cliente").replace(/\s+/g, "-").toLowerCase()}.pdf`,
    });
  } catch (err) {
    console.error("assertiva-baixar-assinado error", err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(bin);
}

function findDownloadUrlDeep(obj: any, depth = 0): string | null {
  if (!obj || depth > 6) return null;
  if (typeof obj === "string") {
    if (/^https?:\/\//i.test(obj) && /\.pdf|s3\.amazonaws|autentica|download|assinad/i.test(obj)) return obj;
    return null;
  }
  if (Array.isArray(obj)) {
    for (const it of obj) {
      const f = findDownloadUrlDeep(it, depth + 1);
      if (f) return f;
    }
    return null;
  }
  if (typeof obj === "object") {
    // Campos prioritários
    const prioritarios = ["urlDownload", "url_download", "downloadUrl", "url", "link", "linkDownload", "arquivoUrl", "documentoUrl"];
    for (const k of prioritarios) {
      const v = (obj as any)[k];
      if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
    }
    for (const k of Object.keys(obj)) {
      const f = findDownloadUrlDeep((obj as any)[k], depth + 1);
      if (f) return f;
    }
  }
  return null;
}
