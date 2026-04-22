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

    // ---------- Carrega venda + template para gerar PDF idêntico ao da tela ----------
    let vendaInfo: { valor_total: number; primeiro_vencimento: string | null } | null = null;
    if (contrato.venda_id) {
      const { data: v } = await admin
        .from("vendas")
        .select("valor_total, primeiro_vencimento")
        .eq("id", contrato.venda_id)
        .maybeSingle();
      if (v) vendaInfo = { valor_total: Number(v.valor_total), primeiro_vencimento: v.primeiro_vencimento };
    }
    const { data: tpl } = await admin
      .from("contract_template")
      .select("title")
      .limit(1).maybeSingle();
    const tplTitle = tpl?.title || "Nota Promissória";

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
    const clientId = Deno.env.get("ASSERTIVA_CLIENT_ID");
    const clientSecret = Deno.env.get("ASSERTIVA_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return json({
        ok: false,
        error: "Credenciais Assertiva não configuradas (ASSERTIVA_CLIENT_ID / ASSERTIVA_CLIENT_SECRET).",
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

    // ---------- 3) Perfil de assinatura (vinculado ao fluxo) ----------
    const perfisResp = await authedFetch(`/v1/jornadas/perfis-assinatura?fluxoId=${fluxoId}&index=1&size=50`);
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
    const perfilId = perfil?.id ?? perfil?.perfilId ?? perfil?.perfilAssinaturaId ?? null;
    console.info("autentica: perfil escolhido", { perfilId, nome: perfil?.nome });
    if (!perfilId) return json({ ok: false, error: "Perfil de assinatura sem ID válido", detail: perfil }, 502);
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

    // ---------- 4) Gera PDF do contrato (mesmo layout da Nota Promissória da tela) ----------
    const vencimentoFmt = vendaInfo?.primeiro_vencimento
      ? formatDateBR(vendaInfo.primeiro_vencimento)
      : null;
    const valorFmt = vendaInfo?.valor_total != null ? formatBRL(vendaInfo.valor_total) : null;
    const pdfBytes = buildPdf({
      title: tplTitle,
      content: contrato.content,
      nome: contrato.nome,
      cpf: contrato.cpf,
      vencimento: vencimentoFmt,
      valorTotal: valorFmt,
      numero: "Nº 1 DE 1",
    });
    const fileName = `contrato-${contrato.id}.pdf`;

    // ---------- 5) Upload do PDF ----------
    // Conforme a coleção oficial Postman da Assertiva ("3 - Criar Pedido" →
    // "Obter Links Upload PDFs" + "Upload PDF para uso no Pedido"):
    //   GET  /v1/jornadas/arquivos/obter-link-upload-interno?quantidadeLinks=1
    //   PUT  <url-temporaria>  com Content-Type: application/octet-stream
    const uploadLinkResp = await authedFetch(
      `/v1/jornadas/arquivos/obter-link-upload-interno?quantidadeLinks=1`,
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

    console.info("autentica: PUT upload", {
      host: new URL(uploadUrl).host,
      path: new URL(uploadUrl).pathname,
      bytes: pdfBytes.byteLength,
    });

    const putResp = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
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
    if (cpfCampoId) camposParte.push({ id: cpfCampoId, valor: cpfDigits });
    if (nomeCampoId) camposParte.push({ id: nomeCampoId, valor: contrato.nome });
    if (celCampoId) camposParte.push({ id: celCampoId, valor: celular });

    const pedidoPayload = {
      partes: [
        {
          perfilId: perfilId,
          fluxoId,
          campos: camposParte,
          anexos: [{ chave: arquivoId, nome: fileName.replace(/\.pdf$/i, ""), extensao: "pdf" }],
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
    console.info("autentica: POST /pedidos status", pedidoResp.status);
    console.info("autentica: POST /pedidos raw response", pedidoText.slice(0, 4000));
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
      pedidoJson?.data?.pedidoId ?? pedidoJson?.pedidoId ?? pedidoJson?.id ?? pedidoJson?.data?.id ?? null;
    const protocolo =
      pedidoJson?.data?.protocolo ?? pedidoJson?.protocolo ?? null;
    const parte = (pedidoJson?.data?.partes ?? pedidoJson?.partes ?? [])[0] ?? null;
    const parteId = parte?.parteId ?? parte?.id ?? null;

    // Procura o link recursivamente em qualquer campo do JSON (cobre variações).
    let linkAssinatura: string | null = findLinkDeep(pedidoJson);
    console.info("autentica: link encontrado no POST?", !!linkAssinatura, linkAssinatura?.slice(0, 80));

    // Se a API não devolveu o link no POST, tentamos buscar via GET do pedido.
    // Endpoints conhecidos da Autentica v1 (alguns retornam 403 dependendo do escopo).
    if (!linkAssinatura && pedidoId) {
      const candidatos = [
        `/v1/jornadas/pedidos/${pedidoId}/link`,
        `/v1/jornadas/pedidos/${pedidoId}/partes/links`,
        parteId ? `/v1/jornadas/pedidos/${pedidoId}/partes/${parteId}/link` : null,
        parteId ? `/v1/jornadas/pedidos/${pedidoId}/partes/${parteId}` : null,
        `/v1/jornadas/pedidos/${pedidoId}`,
        `/v1/jornadas/pedidos/${pedidoId}/partes`,
        parteId ? `/v1/jornadas/partes/${parteId}/link` : null,
        parteId ? `/v1/jornadas/partes/${parteId}` : null,
      ].filter(Boolean) as string[];
      for (const ep of candidatos) {
        const r = await authedFetch(ep);
        const txt = await r.text();
        console.info("autentica: GET link tentativa", ep, r.status, txt.slice(0, 600));
        if (r.ok) {
          const j = safeJson(txt);
          const link = findLinkDeep(j);
          if (link) { linkAssinatura = link; break; }
        }
      }
    }

    const externalId = String(pedidoId ?? parteId ?? protocolo ?? "");

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

// Procura recursivamente por uma URL de assinatura em qualquer campo do objeto.
function findLinkDeep(obj: any, depth = 0): string | null {
  if (!obj || depth > 8) return null;
  if (typeof obj === "string") {
    if (/^https?:\/\//i.test(obj) && /(autentic|assinatur|jornad|assertiv|short)/i.test(obj)) return obj;
    return null;
  }
  if (Array.isArray(obj)) {
    for (const it of obj) {
      const r = findLinkDeep(it, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof obj === "object") {
    const priority = ["linkAssinatura", "urlAssinatura", "shortUrl", "linkCurto", "link", "url"];
    for (const k of priority) {
      const v = (obj as any)[k];
      if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
    }
    for (const k of Object.keys(obj)) {
      const r = findLinkDeep((obj as any)[k], depth + 1);
      if (r) return r;
    }
  }
  return null;
}

function json(data: unknown, _status = 200) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDateBR(iso: string): string {
  // iso: "YYYY-MM-DD"
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

interface PdfInput {
  title: string;
  content: string;
  nome: string;
  cpf: string;
  vencimento: string | null;
  valorTotal: string | null;
  numero: string | null;
}

// Gera o PDF no MESMO layout da tela (Nota Promissória):
// título centralizado + "Nº X DE Y" ao lado, vencimento e valor no canto
// superior direito, corpo do contrato e linha única de assinatura do emitente.
function buildPdf(d: PdfInput): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const usableWidth = pageWidth - margin * 2;

  doc.setTextColor(0, 0, 0);

  // ---- Cabeçalho ----
  const titleText = (d.title || "Nota Promissória").toUpperCase();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  const titleWidth = doc.getTextWidth(titleText);

  const numero = d.numero || "Nº 1 DE 1";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const numWidth = doc.getTextWidth(numero);

  const gap = 8;
  const groupWidth = titleWidth + gap + numWidth;
  const groupStart = (pageWidth - groupWidth) / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(titleText, groupStart, margin + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(numero, groupStart + titleWidth + gap, margin + 2);

  // Vencimento / valor no canto superior direito
  if (d.vencimento || d.valorTotal) {
    doc.setFontSize(9);
    const rightX = pageWidth - margin;
    let ry = margin - 4;
    if (d.vencimento) {
      doc.setFont("helvetica", "normal");
      doc.text(`Vencimento: `, rightX - doc.getTextWidth(d.vencimento) - 4, ry, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(d.vencimento, rightX, ry, { align: "right" });
      ry += 12;
    }
    if (d.valorTotal) {
      doc.setFont("helvetica", "normal");
      doc.text(`Valor: `, rightX - doc.getTextWidth(d.valorTotal) - 4, ry, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(d.valorTotal, rightX, ry, { align: "right" });
    }
  }

  // ---- Corpo do contrato ----
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  const rawLines = d.content.split("\n");
  const lineHeight = 16;
  const rightColumnWidth = 220;
  const gapBetweenColumns = 16;
  const leftColumnWidth = usableWidth - rightColumnWidth - gapBetweenColumns;
  let y = margin + 50;

  for (const rawLine of rawLines) {
    const paragraph = rawLine.trim();
    if (!paragraph) { y += 8; continue; }

    const cityDateMatch = rawLine.match(/^(.*?)([A-Za-zÀ-ÿ\s.-]+-[A-Z]{2}\s*,\s*\d{1,2}\s+de\s+[A-Za-zÀ-ÿ]+\s+de\s+\d{4})\s*$/);
    const spacedColumnsMatch = rawLine.match(/^(.*?)\s{3,}(.+)$/);
    const columnMatch = cityDateMatch
      ? [rawLine, cityDateMatch[1], cityDateMatch[2]]
      : spacedColumnsMatch;

    if (columnMatch) {
      const leftText = String(columnMatch[1]).trim();
      const rightText = String(columnMatch[2]).trim();
      const leftLines = leftText ? doc.splitTextToSize(leftText, leftColumnWidth) : [""];
      const rightLines = doc.splitTextToSize(rightText, rightColumnWidth);
      const totalLines = Math.max(leftLines.length, rightLines.length);

      for (let i = 0; i < totalLines; i++) {
        if (y > pageHeight - margin - 120) { doc.addPage(); y = margin; }
        const leftLine = leftLines[i];
        const rightLine = rightLines[i];
        if (leftLine) doc.text(leftLine, margin, y);
        if (rightLine) doc.text(rightLine, pageWidth - margin, y, { align: "right" });
        y += lineHeight;
      }
      continue;
    }

    const lines = doc.splitTextToSize(paragraph, usableWidth);
    for (const line of lines) {
      if (y > pageHeight - margin - 120) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += 6;
  }

  // ---- Assinatura única (emitente) ----
  if (y > pageHeight - 140) { doc.addPage(); y = margin; }
  y += 50;

  const sigWidth = 280;
  const sigX = (pageWidth - sigWidth) / 2;
  doc.setDrawColor(0);
  doc.setLineWidth(0.6);
  doc.line(sigX, y, sigX + sigWidth, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Assinatura do emitente", pageWidth / 2, y + 14, { align: "center" });

  // Rodapé com numeração de páginas
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Página ${i} de ${total}`, pageWidth - margin, pageHeight - 20, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  const ab = doc.output("arraybuffer") as ArrayBuffer;
  return new Uint8Array(ab);
}
