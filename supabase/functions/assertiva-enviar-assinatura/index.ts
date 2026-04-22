// Edge Function: assertiva-enviar-assinatura
// Envia um contrato para assinatura via WhatsApp na Assertiva Assinaturas.
// Usa secrets nomeados por slug da empresa, com fallback global:
//   ASSERTIVA_AUTH_TOKEN_<SLUG>  →  ASSERTIVA_AUTH_TOKEN
//
// Body: { contrato_id: string }
// Marca contracts.signature_provider="assertiva", signature_external_id, signature_url, status="enviado_assinatura"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASSERTIVA_BASE = "https://api.assertivasolucoes.com.br";

interface BodyInput {
  contrato_id: string;
}

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

    const body = (await req.json().catch(() => ({}))) as Partial<BodyInput>;
    if (!body.contrato_id) return json({ ok: false, error: "contrato_id obrigatório" }, 400);

    // Carrega contrato
    const { data: contrato, error: contratoErr } = await admin
      .from("contracts")
      .select("id, user_id, nome, cpf, telefone, content, empresa_id, status")
      .eq("id", body.contrato_id)
      .maybeSingle();
    if (contratoErr || !contrato) return json({ ok: false, error: "Contrato não encontrado" }, 404);

    // Permissão: dono ou admin
    if (contrato.user_id !== userId) {
      const { data: roleRow } = await admin
        .from("user_roles").select("role")
        .eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleRow) return json({ ok: false, error: "Sem permissão" }, 403);
    }

    if (!contrato.telefone) {
      return json({ ok: false, error: "Contrato sem telefone para envio via WhatsApp" }, 400);
    }

    // Resolve slug da empresa
    let empresaSlug: string | null = null;
    if (contrato.empresa_id) {
      const { data: emp } = await admin
        .from("empresas").select("slug, ativo").eq("id", contrato.empresa_id).maybeSingle();
      if (emp) {
        if (!emp.ativo) return json({ ok: false, error: "Empresa inativa" }, 400);
        empresaSlug = emp.slug;
      }
    }

    const suffix = empresaSlug ? `_${empresaSlug}` : "";
    const assertivaToken = Deno.env.get(`ASSERTIVA_AUTH_TOKEN${suffix}`) ?? Deno.env.get("ASSERTIVA_AUTH_TOKEN");
    if (!assertivaToken) {
      return json({
        ok: false,
        error: `Secret ASSERTIVA_AUTH_TOKEN${suffix} não configurado`,
      }, 500);
    }

    // Limpa telefone (apenas dígitos com DDI 55)
    const telefoneDigits = contrato.telefone.replace(/\D/g, "");
    const celular = telefoneDigits.startsWith("55") ? telefoneDigits : `55${telefoneDigits}`;

    // Payload da Assertiva Assinaturas — envio único signatário via WhatsApp
    const payload = {
      nome: `Contrato ${contrato.nome} - ${contrato.cpf}`,
      mensagem: "Olá! Segue o contrato para sua assinatura.",
      signatarios: [
        {
          nome: contrato.nome,
          email: null,
          celular,
          tipoEnvio: "WHATSAPP",
          documento: contrato.cpf.replace(/\D/g, ""),
          tipoAssinatura: "ELETRONICA",
        },
      ],
      arquivo: {
        nome: `contrato-${contrato.id}.txt`,
        // A Assertiva aceita conteúdo base64; aqui mandamos o texto convertido.
        conteudo: btoa(unescape(encodeURIComponent(contrato.content))),
      },
    };

    const resp = await fetch(`${ASSERTIVA_BASE}/v3/assinaturas/documentos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${assertivaToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const respText = await resp.text();
    let respJson: any = null;
    try { respJson = JSON.parse(respText); } catch {}

    if (!resp.ok) {
      console.error("Assertiva error:", resp.status, respText.slice(0, 500));
      return json({
        ok: false,
        error: respJson?.message || respJson?.erro || `HTTP ${resp.status}: ${respText.slice(0, 300)}`,
      }, 502);
    }

    const externalId = respJson?.id ?? respJson?.documento?.id ?? respJson?.data?.id ?? null;
    const signatureUrl = respJson?.url ?? respJson?.documento?.url ?? respJson?.data?.url ?? null;

    // Atualiza contrato
    await admin.from("contracts").update({
      signature_provider: "assertiva",
      signature_external_id: externalId,
      signature_url: signatureUrl,
      signature_data: respJson,
      status: "enviado_assinatura",
    }).eq("id", contrato.id);

    return json({
      ok: true,
      message: "Contrato enviado para assinatura via WhatsApp",
      external_id: externalId,
      signature_url: signatureUrl,
      empresa_slug: empresaSlug,
    });
  } catch (err) {
    console.error("assertiva-enviar-assinatura error", err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
