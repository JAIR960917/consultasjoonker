// Edge Function: assertiva-enviar-assinatura
// Envia um contrato para assinatura via WhatsApp na Assertiva Assinaturas.
//
// Autenticação: OAuth2 client_credentials no endpoint
//   POST https://api.assertivasolucoes.com.br/oauth2/v3/token
// usando ASSERTIVA_CLIENT_ID_<SLUG> + ASSERTIVA_CLIENT_SECRET_<SLUG>
// (com fallback para os secrets globais sem sufixo).
//
// Compatibilidade: se a empresa ainda só tem ASSERTIVA_AUTH_TOKEN_<SLUG>
// configurado (token estático antigo), usa esse token diretamente.
//
// Body: { contrato_id: string }

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

    const { data: contrato, error: contratoErr } = await admin
      .from("contracts")
      .select("id, user_id, nome, cpf, telefone, content, empresa_id, venda_id, status")
      .eq("id", body.contrato_id)
      .maybeSingle();
    if (contratoErr || !contrato) return json({ ok: false, error: "Contrato não encontrado" }, 404);

    if (contrato.user_id !== userId) {
      const { data: roleRow } = await admin
        .from("user_roles").select("role")
        .eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleRow) return json({ ok: false, error: "Sem permissão" }, 403);
    }

    if (!contrato.telefone) {
      return json({ ok: false, error: "Contrato sem telefone para envio via WhatsApp" }, 400);
    }

    // Resolve empresa: contrato -> venda -> profile do usuário do contrato
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
    console.log("assertiva-enviar-assinatura empresa resolvida:", { contrato_id: contrato.id, empresaId });

    let empresaSlug: string | null = null;
    if (empresaId) {
      const { data: emp } = await admin
        .from("empresas").select("slug, ativo").eq("id", empresaId).maybeSingle();
      if (emp) {
        if (!emp.ativo) return json({ ok: false, error: "Empresa inativa" }, 400);
        empresaSlug = emp.slug;
      }
    }

    const suffix = empresaSlug ? `_${empresaSlug}` : "";

    // 1) Tenta OAuth2 client_credentials
    const clientId =
      Deno.env.get(`ASSERTIVA_CLIENT_ID${suffix}`) ?? Deno.env.get("ASSERTIVA_CLIENT_ID");
    const clientSecret =
      Deno.env.get(`ASSERTIVA_CLIENT_SECRET${suffix}`) ?? Deno.env.get("ASSERTIVA_CLIENT_SECRET");

    let bearer: string | null = null;
    let authMode: "oauth2" | "static" = "oauth2";

    if (clientId && clientSecret) {
      const tokenResp = await fetch(`${ASSERTIVA_BASE}/oauth2/v3/token`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: "grant_type=client_credentials",
      });
      const tokenText = await tokenResp.text();
      let tokenJson: any = null;
      try { tokenJson = JSON.parse(tokenText); } catch {}
      if (!tokenResp.ok || !tokenJson?.access_token) {
        console.error("Assertiva OAuth2 token error:", tokenResp.status, tokenText.slice(0, 500));
        return json({
          ok: false,
          error: tokenJson?.error_description || tokenJson?.message ||
            `Falha ao obter token OAuth2 (HTTP ${tokenResp.status}). Verifique ASSERTIVA_CLIENT_ID${suffix} / ASSERTIVA_CLIENT_SECRET${suffix}.`,
        }, 502);
      }
      bearer = tokenJson.access_token as string;
    } else {
      // 2) Fallback compatibilidade: usa token estático antigo
      const staticToken =
        Deno.env.get(`ASSERTIVA_AUTH_TOKEN${suffix}`) ?? Deno.env.get("ASSERTIVA_AUTH_TOKEN");
      if (!staticToken) {
        return json({
          ok: false,
          error:
            `Credenciais Assertiva não configuradas. Cadastre ASSERTIVA_CLIENT_ID${suffix} e ASSERTIVA_CLIENT_SECRET${suffix}.`,
        }, 500);
      }
      bearer = staticToken;
      authMode = "static";
    }

    const telefoneDigits = contrato.telefone.replace(/\D/g, "");
    const celular = telefoneDigits.startsWith("55") ? telefoneDigits : `55${telefoneDigits}`;

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
        conteudo: btoa(unescape(encodeURIComponent(contrato.content))),
      },
    };

    const resp = await fetch(`${ASSERTIVA_BASE}/v3/assinaturas/documentos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const respText = await resp.text();
    let respJson: any = null;
    try { respJson = JSON.parse(respText); } catch {}

    if (!resp.ok) {
      console.error("Assertiva error:", resp.status, respText.slice(0, 500), "authMode=", authMode);
      return json({
        ok: false,
        error: respJson?.message || respJson?.erro ||
          `HTTP ${resp.status}: ${respText.slice(0, 300)} (authMode=${authMode})`,
      }, 502);
    }

    const externalId = respJson?.id ?? respJson?.documento?.id ?? respJson?.data?.id ?? null;
    const signatureUrl = respJson?.url ?? respJson?.documento?.url ?? respJson?.data?.url ?? null;

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
      auth_mode: authMode,
    });
  } catch (err) {
    console.error("assertiva-enviar-assinatura error", err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, _status = 200) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
