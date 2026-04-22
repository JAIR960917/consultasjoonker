// Edge Function: assertiva-enviar-assinatura
// Envia o contrato para validação de identidade + assinatura via Assertiva Autentica.
//
// Fluxo:
// 1) OAuth2 client_credentials → token
// 2) GET /v1/jornadas/fluxos/ativos       → pega 1º fluxo ativo da empresa
// 3) GET /v1/jornadas/perfis-assinatura   → pega IDs dos campos (CPF, Nome, Celular, Email)
// 4) GET /v1/jornadas/arquivos/obter-link-upload-interno → URL temporária para upload
// 5) PUT do PDF gerado a partir do conteúdo do contrato
// 6) POST /v1/jornadas/pedidos             → dispara o link por SMS
//
// Body: { contrato_id: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASSERTIVA_BASE = "https://api.assertivasolucoes.com.br";
const AUTH_BASE = `${ASSERTIVA_BASE}/autentica`;

interface BodyInput { contrato_id: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("auth: missing Bearer header");
      return json({ ok: false, error: "Unauthorized: cabeçalho Authorization ausente" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      console.error("auth: getUser failed", userErr?.message ?? "(no message)", JSON.stringify(userErr ?? {}));
      return json({ ok: false, error: `Unauthorized: ${userErr?.message ?? "sessão inválida"}` }, 401);
    }
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = (await req.json().catch(() => ({}))) as Partial<BodyInput>;
    if (!body.contrato_id) return json({ ok: false, error: "contrato_id obrigatório" }, 400);

    // ---------- Carrega contrato ----------
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
      return json({ ok: false, error: "Contrato sem telefone para envio via SMS" }, 400);
    }

    // ---------- Resolve empresa ----------
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
    console.log("autentica: empresa", { empresaId, empresaSlug });

    // ---------- 1) OAuth2 token ----------
    const clientId =
      Deno.env.get(`ASSERTIVA_CLIENT_ID${suffix}`) ?? Deno.env.get("ASSERTIVA_CLIENT_ID");
    const clientSecret =
      Deno.env.get(`ASSERTIVA_CLIENT_SECRET${suffix}`) ?? Deno.env.get("ASSERTIVA_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return json({
        ok: false,
        error: `Credenciais Assertiva não configuradas. Cadastre ASSERTIVA_CLIENT_ID${suffix} e ASSERTIVA_CLIENT_SECRET${suffix}.`,
      }, 500);
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
    const tokenText = await tokenResp.text();
    const tokenJson = safeJson(tokenText);
    if (!tokenResp.ok || !tokenJson?.access_token) {
      console.error("Autentica OAuth2 token error:", tokenResp.status, tokenText.slice(0, 500));
      return json({
        ok: false,
        error: tokenJson?.error_description || tokenJson?.message ||
          `Falha ao obter token OAuth2 (HTTP ${tokenResp.status}).`,
      }, 502);
    }
    const bearer = tokenJson.access_token as string;

    const authedFetch = (path: string, init: RequestInit = {}) =>
      fetch(`${AUTH_BASE}${path}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${bearer}`,
          Accept: "application/json",
        },
      });

    // ---------- 2) Fluxo ativo ----------
    const fluxosResp = await authedFetch(`/v1/jornadas/fluxos/ativos?index=1&size=50`);
    const fluxosText = await fluxosResp.text();
    const fluxosJson = safeJson(fluxosText);
    if (!fluxosResp.ok) {
      console.error("Autentica fluxos error:", fluxosResp.status, fluxosText.slice(0, 500));
      return json({
        ok: false,
        error: `Falha ao listar fluxos ativos (HTTP ${fluxosResp.status}). Verifique se a empresa tem o produto Assertiva Autentica habilitado.`,
        detail: fluxosJson ?? fluxosText.slice(0, 300),
      }, 502);
    }
    console.info("autentica: fluxos raw response", fluxosText.slice(0, 1500));
    const fluxos: any[] = Array.isArray(fluxosJson)
      ? fluxosJson
      : (fluxosJson?.data?.jornadas
        ?? fluxosJson?.jornadas
        ?? fluxosJson?.data
        ?? fluxosJson?.fluxos
        ?? fluxosJson?.items
        ?? fluxosJson?.content
        ?? fluxosJson?.resultado
        ?? []);
    if (!fluxos.length) {
      return json({
        ok: false,
        error: "Nenhum fluxo de coleta ativo encontrado na conta Assertiva. Crie um fluxo no Backoffice da Assertiva (com Selfie + Documento + Proposta).",
        detail: fluxosJson ?? fluxosText.slice(0, 500),
      }, 400);
    }
    // Prefere fluxo com proposta (necessário para anexar PDF do contrato)
    const fluxo = fluxos.find((f: any) => f?.possuiProposta) ?? fluxos[0];
    const fluxoId = fluxo?.id ?? fluxo?.fluxoId ?? fluxo?.codigo;
    if (!fluxoId) {
      return json({ ok: false, error: "Não foi possível identificar o ID do fluxo retornado", detail: fluxo }, 502);
    }

    // ---------- 3) Perfil de assinatura ----------
    const perfisResp = await authedFetch(`/v1/jornadas/perfis-assinatura?index=1&size=50`);
    const perfisText = await perfisResp.text();
    const perfisJson = safeJson(perfisText);
    if (!perfisResp.ok) {
      console.error("Autentica perfis error:", perfisResp.status, perfisText.slice(0, 500));
      return json({ ok: false, error: `Falha ao obter perfis de assinatura (HTTP ${perfisResp.status})`, detail: perfisJson ?? perfisText.slice(0, 300) }, 502);
    }
    console.info("autentica: perfis raw response", perfisText.slice(0, 1500));
    const perfis: any[] = Array.isArray(perfisJson)
      ? perfisJson
      : (perfisJson?.data?.perfis
        ?? perfisJson?.data?.items
        ?? perfisJson?.perfis
        ?? perfisJson?.items
        ?? perfisJson?.content
        ?? perfisJson?.resultado
        ?? perfisJson?.data
        ?? []);
    const perfil = perfis.find((p: any) => (p?.campos?.length ?? p?.fields?.length ?? 0) > 0) ?? perfis[0];
    if (!perfil) return json({ ok: false, error: "Nenhum perfil de assinatura disponível", detail: perfisJson ?? perfisText.slice(0, 500) }, 502);
    const campos: any[] = perfil?.campos ?? perfil?.fields ?? [];
    const findCampo = (...names: string[]): string | null => {
      for (const c of campos) {
        const nome = String(c?.nome ?? c?.descricao ?? c?.label ?? "").toLowerCase();
        if (names.some(n => nome.includes(n))) return c?.id ?? c?.campoId ?? null;
      }
      return null;
    };
    const cpfCampoId = findCampo("cpf");
    const nomeCampoId = findCampo("nome");
    const celCampoId = findCampo("celular", "telefone", "phone");
    const emailCampoId = findCampo("email", "e-mail");

    // ---------- 4) Gera PDF do contrato ----------
    const pdfBytes = buildPdf(contrato.content, contrato.nome, contrato.cpf);
    const fileName = `contrato-${contrato.id}.pdf`;

    // ---------- 5) Upload do PDF ----------
    const uploadLinkResp = await authedFetch(
      `/v1/jornadas/arquivos/obter-link-upload-interno?nomeArquivo=${encodeURIComponent(fileName)}`,
    );
    const uploadLinkText = await uploadLinkResp.text();
    const uploadLinkJson = safeJson(uploadLinkText);
    if (!uploadLinkResp.ok) {
      console.error("Autentica upload-link error:", uploadLinkResp.status, uploadLinkText.slice(0, 500));
      return json({ ok: false, error: `Falha ao obter link de upload (HTTP ${uploadLinkResp.status})`, detail: uploadLinkJson ?? uploadLinkText.slice(0, 300) }, 502);
    }
    console.info("autentica: upload-link raw response", uploadLinkText.slice(0, 1500));
    const ulData = uploadLinkJson?.data ?? uploadLinkJson;
    const ulFirst = Array.isArray(ulData?.links) ? ulData.links[0]
      : Array.isArray(ulData?.items) ? ulData.items[0]
      : ulData;
    const uploadUrl: string | null =
      ulFirst?.url ?? ulFirst?.link ?? ulFirst?.linkUpload ?? ulFirst?.uploadUrl ?? ulFirst?.urlUpload ?? null;
    const arquivoId: string | null =
      ulFirst?.chave ?? ulFirst?.id ?? ulFirst?.arquivoId ?? ulFirst?.identificador ?? ulFirst?.idArquivo ?? ulFirst?.fileId ?? null;
    if (!uploadUrl || !arquivoId) {
      return json({ ok: false, error: "Resposta do link de upload inesperada", detail: uploadLinkJson ?? uploadLinkText.slice(0, 500) }, 502);
    }

    // S3 SigV2 com STS: o `x-amz-security-token` aparece na query mas o S3
    // o inclui no StringToSign como header canonicalizado. Precisamos enviá-lo
    // como header HTTP no PUT, com o valor exato decodificado.
    // Extraímos o token preservando caracteres ('+' tratados como espaço pelo
    // URLSearchParams quebram a assinatura, então parseamos manualmente).
    let amzToken: string | null = null;
    try {
      const qs = uploadUrl.split("?")[1] ?? "";
      for (const part of qs.split("&")) {
        const eq = part.indexOf("=");
        if (eq < 0) continue;
        const k = part.slice(0, eq);
        if (k === "x-amz-security-token") {
          amzToken = decodeURIComponent(part.slice(eq + 1));
          break;
        }
      }
    } catch (_) { /* noop */ }

    // IMPORTANTE: a Assertiva assina a URL SEM Content-Type. Se enviarmos
    // Content-Type, o S3 inclui no StringToSign e a assinatura quebra
    // (SignatureDoesNotMatch). Enviamos só o x-amz-security-token.
    const putHeaders: Record<string, string> = {};
    if (amzToken) putHeaders["x-amz-security-token"] = amzToken;

    console.info("autentica: PUT upload", {
      host: new URL(uploadUrl).host,
      path: new URL(uploadUrl).pathname,
      hasTokenHeader: !!amzToken,
      tokenLen: amzToken?.length ?? 0,
      bytes: pdfBytes.byteLength,
    });

    const putResp = await fetch(uploadUrl, {
      method: "PUT",
      headers: putHeaders,
      body: pdfBytes,
    });
    if (!putResp.ok) {
      const txt = await putResp.text();
      console.error("Autentica PUT pdf error:", putResp.status, txt.slice(0, 800));
      return json({ ok: false, error: `Falha ao subir PDF (HTTP ${putResp.status}): ${txt.slice(0, 200)}` }, 502);
    }
    console.info("autentica: PUT upload OK", putResp.status);

    // ---------- 6) Cria pedido ----------
    const telefoneDigits = contrato.telefone.replace(/\D/g, "");
    const celular = telefoneDigits.length > 11 ? telefoneDigits.slice(-11) : telefoneDigits;
    const cpfDigits = contrato.cpf.replace(/\D/g, "");

    const camposParte: any[] = [];
    if (cpfCampoId) camposParte.push({ campoId: cpfCampoId, valor: cpfDigits });
    if (nomeCampoId) camposParte.push({ campoId: nomeCampoId, valor: contrato.nome });
    if (celCampoId) camposParte.push({ campoId: celCampoId, valor: celular });
    if (emailCampoId) camposParte.push({ campoId: emailCampoId, valor: "" });

    const pedidoPayload = {
      partes: [
        {
          fluxoId,
          perfilAssinaturaId: perfil?.id ?? perfil?.perfilId,
          campos: camposParte,
          anexos: [{ id: arquivoId, nome: fileName }],
        },
      ],
    };

    const pedidoResp = await authedFetch(`/v1/jornadas/pedidos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedidoPayload),
    });
    const pedidoText = await pedidoResp.text();
    const pedidoJson = safeJson(pedidoText);
    if (!pedidoResp.ok) {
      console.error("Autentica criar pedido error:", pedidoResp.status, pedidoText.slice(0, 800));
      return json({
        ok: false,
        error: pedidoJson?.message || pedidoJson?.erro ||
          `Falha ao criar pedido (HTTP ${pedidoResp.status}): ${pedidoText.slice(0, 300)}`,
        detail: pedidoJson ?? pedidoText.slice(0, 300),
      }, 502);
    }

    const pedidoId =
      pedidoJson?.id ?? pedidoJson?.pedidoId ?? pedidoJson?.data?.id ?? null;
    const protocolo =
      pedidoJson?.protocolo ?? pedidoJson?.data?.protocolo ?? null;
    const parte = (pedidoJson?.partes ?? pedidoJson?.data?.partes ?? [])[0] ?? null;
    const parteId = parte?.id ?? null;
    const linkAssinatura = parte?.link ?? pedidoJson?.link ?? null;
    const externalId = String(parteId ?? pedidoId ?? protocolo ?? "");

    await admin.from("contracts").update({
      signature_provider: "assertiva-autentica",
      signature_external_id: externalId,
      signature_url: linkAssinatura,
      signature_data: pedidoJson,
      status: "enviado_assinatura",
    }).eq("id", contrato.id);

    return json({
      ok: true,
      message: "Link de validação enviado por SMS via Assertiva Autentica",
      pedido_id: pedidoId,
      parte_id: parteId,
      protocolo,
      signature_url: linkAssinatura,
      empresa_slug: empresaSlug,
    });
  } catch (err) {
    console.error("assertiva-enviar-assinatura error", err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function safeJson(text: string): any {
  try { return JSON.parse(text); } catch { return null; }
}

function json(data: unknown, _status = 200) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Gera um PDF simples (texto) com o conteúdo do contrato.
function buildPdf(content: string, nome: string, cpf: string): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const usableWidth = pageWidth - margin * 2;

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("CONTRATO", pageWidth / 2, margin + 10, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${nome} • CPF ${cpf}`, pageWidth / 2, margin + 28, { align: "center" });

  doc.setFontSize(11);
  let y = margin + 60;
  const lineHeight = 14;
  const paragraphs = content.split("\n");
  for (const p of paragraphs) {
    const text = p.trim();
    if (!text) { y += 8; continue; }
    const lines = doc.splitTextToSize(text, usableWidth);
    for (const line of lines) {
      if (y > pageHeight - margin) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += 4;
  }

  // jsPDF retorna ArrayBuffer
  const ab = doc.output("arraybuffer") as ArrayBuffer;
  return new Uint8Array(ab);
}
