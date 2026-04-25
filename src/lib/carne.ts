import jsPDF from "jspdf";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import coraLogoUrl from "@/assets/cora-logo.jpg";

export interface CarneParcela {
  numero_parcela: number;
  total_parcelas: number;
  valor: number;
  vencimento: string; // YYYY-MM-DD
  linha_digitavel: string | null;
  codigo_barras: string | null;
  pix_emv: string | null;
  cora_invoice_id: string | null;
  nosso_numero?: string | null;
  numero_documento?: string | null;
}

export interface CarneEmpresa {
  nome: string;
  cnpj: string;
}

export interface CarnePagador {
  nome: string;
  cpf: string;
}

export interface CarneOptions {
  empresa: CarneEmpresa;
  pagador: CarnePagador;
  parcelas: CarneParcela[];
  descricao?: string; // ex.: "Oculos"
  data_emissao?: string; // YYYY-MM-DD
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDateBR = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR");
};

const maskCnpj = (s: string) => {
  const d = (s || "").replace(/\D/g, "").padStart(14, "0").slice(-14);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};
const maskCpf = (s: string) => {
  const d = (s || "").replace(/\D/g, "").padStart(11, "0").slice(-11);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

async function qrDataUrl(text: string): Promise<string> {
  return await QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

function barcodeDataUrl(linhaDigitavel: string): string | null {
  const digits = (linhaDigitavel || "").replace(/\D/g, "");
  if (digits.length !== 47) return null;
  const campo1 = digits.slice(0, 9);
  const campo2 = digits.slice(10, 20);
  const campo3 = digits.slice(21, 31);
  const dv = digits.slice(32, 33);
  const fatorVenc = digits.slice(33, 37);
  const valor = digits.slice(37, 47);
  const barcode44 =
    campo1.slice(0, 4) + dv + fatorVenc + valor + campo1.slice(4) + campo2 + campo3;
  if (barcode44.length !== 44) return null;
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, barcode44, {
      format: "ITF",
      displayValue: false,
      height: 50,
      width: 1.1,
      margin: 0,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/* ---------------- Layout helpers ---------------- */

function cell(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  opts?: { bold?: boolean; align?: "left" | "right"; valueSize?: number; border?: boolean },
) {
  if (opts?.border !== false) {
    doc.setDrawColor(180);
    doc.setLineWidth(0.3);
    doc.rect(x, y, w, h);
  }
  if (label) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(90);
    doc.text(label, x + 2, y + 5);
  }
  if (value) {
    doc.setTextColor(0);
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(opts?.valueSize ?? 8);
    const align = opts?.align ?? "left";
    const tx = align === "right" ? x + w - 2 : x + 2;
    doc.text(value, tx, y + h - 3, { align });
  }
}

function dashedLine(doc: jsPDF, x1: number, y1: number, x2: number, y2: number) {
  doc.setLineDashPattern([2, 2], 0);
  doc.setDrawColor(150);
  doc.setLineWidth(0.4);
  doc.line(x1, y1, x2, y2);
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(0);
}

function coraHeader(doc: jsPDF, x: number, y: number, logoImg: string) {
  // Logo "C cora | 403-9 |"
  try {
    doc.addImage(logoImg, "JPEG", x, y, 28, 8);
  } catch {
    // fallback texto
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(232, 64, 95);
    doc.text("cora", x, y + 7);
  }
  doc.setTextColor(120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("| 403-9 |", x + 30, y + 6);
  doc.setTextColor(0);
}

/* ---------------- Render boleto block ---------------- */

async function drawBoletoBlock(
  doc: jsPDF,
  opts: CarneOptions,
  p: CarneParcela,
  logoImg: string,
  bx: number, // top-left x
  by: number, // top-left y
  bw: number, // total width
  bh: number, // total height
) {
  const { empresa, pagador } = opts;

  // 3 colunas: recibo (esq) | compensação (centro) | pix (dir)
  const colReciboW = bw * 0.18;
  const colPixW = bw * 0.13;
  const colCompW = bw - colReciboW - colPixW;

  const xRec = bx;
  const xComp = bx + colReciboW;
  const xPix = bx + colReciboW + colCompW;

  /* ============ COLUNA ESQUERDA: RECIBO DO PAGADOR ============ */
  let y = by;
  coraHeader(doc, xRec + 2, y + 2, logoImg);
  y += 12;

  const recH = bh - 12;
  const recRow = recH / 11; // 11 sub-células aprox
  const halfW = colReciboW / 2;

  cell(doc, xRec, y, halfW, recRow, "Parcela/Plano", `${p.numero_parcela}/${p.total_parcelas}`, { bold: true });
  cell(doc, xRec + halfW, y, halfW, recRow, "Vencimento", fmtDateBR(p.vencimento), { bold: true, align: "right" });
  y += recRow;
  cell(doc, xRec, y, colReciboW, recRow, "Nosso número", p.nosso_numero ?? p.cora_invoice_id ?? "—", { align: "right" });
  y += recRow;
  cell(doc, xRec, y, colReciboW, recRow, "Número do documento", p.numero_documento ?? p.cora_invoice_id?.slice(-9) ?? "—", { align: "right" });
  y += recRow;
  cell(doc, xRec, y, colReciboW, recRow, "(=) Valor do documento", fmtBRL(Number(p.valor)), { bold: true, align: "right" });
  y += recRow;
  cell(doc, xRec, y, colReciboW, recRow, "(-) Desconto", "");
  y += recRow;
  cell(doc, xRec, y, colReciboW, recRow, "(-) Outras deduções/Abatimento", "");
  y += recRow;
  cell(doc, xRec, y, colReciboW, recRow, "(+) Mora/Multa/Juros", "");
  y += recRow;
  cell(doc, xRec, y, colReciboW, recRow, "(+) Outros acréscimos", "");
  y += recRow;
  cell(doc, xRec, y, colReciboW, recRow, "(=) Valor cobrado", "");
  y += recRow;
  cell(doc, xRec, y, colReciboW, recRow, "Pagador", pagador.nome);
  y += recRow;
  cell(doc, xRec, y, colReciboW, recRow * 1, "Beneficiário", `${empresa.nome}\n${maskCnpj(empresa.cnpj)}`);
  // último cell: nome+cnpj em duas linhas → desenha manualmente
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(maskCnpj(empresa.cnpj), xRec + 2, y + recRow - 3);

  /* ============ DIVISÓRIA TRACEJADA ESQ↔CENTRO ============ */
  dashedLine(doc, xComp, by, xComp, by + bh);

  /* ============ COLUNA CENTRAL: FICHA DE COMPENSAÇÃO ============ */
  // Header: logo + linha digitável à direita
  coraHeader(doc, xComp + 4, by + 2, logoImg);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(p.linha_digitavel ?? "—", xComp + colCompW - 2, by + 8, { align: "right" });

  let cy = by + 12;
  const compRow = 14;

  // Linha 1: Local de pagamento (full)
  cell(doc, xComp, cy, colCompW, compRow, "Local de Pagamento", "Pagável em qualquer agência bancária");
  cy += compRow;

  // Linha 2: Beneficiário | CNPJ | Agência/Código
  const c2a = colCompW * 0.50;
  const c2b = colCompW * 0.27;
  const c2c = colCompW - c2a - c2b;
  cell(doc, xComp, cy, c2a, compRow, "Beneficiário", empresa.nome);
  cell(doc, xComp + c2a, cy, c2b, compRow, "CNPJ/CPF do beneficiário", maskCnpj(empresa.cnpj));
  cell(doc, xComp + c2a + c2b, cy, c2c, compRow, "Agência/Código do beneficiário", "0001", { align: "right" });
  cy += compRow;

  // Linha 3: Data doc | Nº doc | Espécie | Aceite | Nosso número
  const c3 = [colCompW * 0.18, colCompW * 0.20, colCompW * 0.10, colCompW * 0.08];
  c3.push(colCompW - c3.reduce((a, b) => a + b, 0));
  let cx = xComp;
  cell(doc, cx, cy, c3[0], compRow, "Data do documento", fmtDateBR(opts.data_emissao ?? new Date().toISOString().slice(0, 10))); cx += c3[0];
  cell(doc, cx, cy, c3[1], compRow, "Número do documento", p.numero_documento ?? p.cora_invoice_id?.slice(-9) ?? "—"); cx += c3[1];
  cell(doc, cx, cy, c3[2], compRow, "Espécie doc.", "DV"); cx += c3[2];
  cell(doc, cx, cy, c3[3], compRow, "Aceite", "N"); cx += c3[3];
  cell(doc, cx, cy, c3[4], compRow, "Nosso número", p.nosso_numero ?? p.cora_invoice_id ?? "—", { align: "right" });
  cy += compRow;

  // Linha 4: Carteira | Espécie moeda | Quantidade | Valor (sem (=) Valor doc à direita aqui — já é mostrado depois)
  cx = xComp;
  cell(doc, cx, cy, c3[0], compRow, "Carteira", "01"); cx += c3[0];
  cell(doc, cx, cy, c3[1], compRow, "Espécie moeda", "R$"); cx += c3[1];
  cell(doc, cx, cy, c3[2] + c3[3], compRow, "Quantidade", ""); cx += c3[2] + c3[3];
  cell(doc, cx, cy, c3[4], compRow, "(=) Valor do documento", fmtBRL(Number(p.valor)), { bold: true, align: "right" });
  cy += compRow;

  // Bloco grande central com descrição (esquerda) e sub-rows à direita (deduções)
  const bigW = c3[0] + c3[1] + c3[2] + c3[3];
  const subRowH = 12;
  const bigH = subRowH * 5;
  // borda esquerda do bloco grande
  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.rect(xComp, cy, bigW, bigH);

  // Descrição dentro do bloco grande
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(0);
  const descPrefix = opts.descricao ? `${opts.descricao} ` : "";
  doc.text(`${descPrefix}Parcela ${p.numero_parcela}/${p.total_parcelas}`, xComp + 3, cy + 18);
  doc.setFontSize(7.5);
  doc.text("Após o vencimento, aplicar multa de R$ 0,20 e juros de 1,00% ao mês.", xComp + 3, cy + 30);

  // Sub-rows à direita (deduções/valor cobrado)
  const subLabels = [
    "(-) Desconto",
    "(-) Outras deduções/Abatimentos",
    "(+) Mora/Multa/Juros",
    "(+) Outros acréscimos",
    "(=) Valor cobrado",
  ];
  for (let i = 0; i < 5; i++) {
    cell(doc, xComp + bigW, cy + subRowH * i, c3[4], subRowH, subLabels[i], "", { align: "right" });
  }
  cy += bigH;

  // Linha Pagador (full no compensação)
  cell(doc, xComp, cy, colCompW, compRow, "Pagador", `${pagador.nome} - CPF ${maskCpf(pagador.cpf)}`);
  cy += compRow;

  // Linha Sacador/Avalista
  cell(doc, xComp, cy, colCompW, compRow, "Sacador/Avalista", "");
  cy += compRow;

  // Código de barras + autenticação mecânica
  if (p.linha_digitavel) {
    const bcUrl = barcodeDataUrl(p.linha_digitavel);
    if (bcUrl) {
      doc.addImage(bcUrl, "PNG", xComp + 2, cy + 2, colCompW * 0.65, 26);
    }
  }
  doc.setFontSize(6.5);
  doc.setTextColor(120);
  doc.text("Autenticação mecânica - Ficha de compensação", xComp + 2, cy + 36);
  doc.setTextColor(0);

  /* ============ DIVISÓRIA TRACEJADA CENTRO↔PIX ============ */
  dashedLine(doc, xPix, by, xPix, by + bh);

  /* ============ COLUNA DIREITA: PIX ============ */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("Pague este boleto via PIX", xPix + colPixW / 2, by + 16, { align: "center" });

  if (p.pix_emv) {
    try {
      const qr = await qrDataUrl(p.pix_emv);
      const qrSize = Math.min(colPixW - 8, 70);
      const qx = xPix + (colPixW - qrSize) / 2;
      doc.addImage(qr, "PNG", qx, by + 22, qrSize, qrSize);
    } catch {
      /* ignore */
    }
  }
}

/* ---------------- Top header (página 1 apenas) ---------------- */
function drawTopHeader(
  doc: jsPDF,
  opts: CarneOptions,
  logoImg: string,
  margin: number,
  pageW: number,
) {
  const y = margin;
  doc.setTextColor(232, 64, 95);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Essa é a sua cobrança,", margin, y + 12);
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.text(opts.pagador.nome, margin, y + 30);

  // Logo central
  try {
    doc.addImage(logoImg, "JPEG", pageW / 2 - 30, y + 4, 60, 18);
  } catch {
    /* ignore */
  }

  // Beneficiário e descrição
  doc.setTextColor(232, 64, 95);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Beneficiário", margin, y + 56);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(opts.empresa.nome, margin, y + 70);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`CNPJ ${maskCnpj(opts.empresa.cnpj)}`, margin, y + 82);

  doc.setTextColor(232, 64, 95);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Descrição", margin, y + 100);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(opts.descricao ?? "Cobrança", margin, y + 114);

  // Data emissão
  doc.setTextColor(232, 64, 95);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Data de emissão: ${fmtDateBR(opts.data_emissao ?? new Date().toISOString().slice(0, 10))}`,
    pageW - margin,
    y + 56,
    { align: "right" },
  );
  doc.setTextColor(0);
}

/* ---------------- Public API ---------------- */

async function loadLogoDataUrl(): Promise<string> {
  // jsPDF aceita o módulo importado direto se for dataURL/URL acessível.
  // Convertemos para dataURL via fetch para garantir.
  try {
    const resp = await fetch(coraLogoUrl);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return coraLogoUrl;
  }
}

export async function buildCarnePdf(opts: CarneOptions): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const usableW = pageW - margin * 2;

  const logo = await loadLogoDataUrl();

  // Layout: 3 boletos por página A4 (após o header da pág 1)
  const headerH = 140; // só na 1ª página
  const boletoH = 240; // altura de cada boleto

  let cursorY = margin + headerH; // 1ª página com header
  drawTopHeader(doc, opts, logo, margin, pageW);

  for (let i = 0; i < opts.parcelas.length; i++) {
    const remaining = pageH - margin - cursorY;
    if (remaining < boletoH) {
      doc.addPage();
      cursorY = margin;
    }
    await drawBoletoBlock(doc, opts, opts.parcelas[i], logo, margin, cursorY, usableW, boletoH);
    cursorY += boletoH;
    // linha tracejada horizontal de recorte entre boletos
    if (i < opts.parcelas.length - 1 && pageH - margin - cursorY >= boletoH) {
      dashedLine(doc, margin, cursorY, pageW - margin, cursorY);
    }
    cursorY += 6;
  }

  // Rodapé numeração
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text(`Página ${i} de ${total}`, pageW - margin, pageH - 10, { align: "right" });
    doc.setTextColor(0);
  }
  return doc;
}

export async function downloadCarnePdf(opts: CarneOptions, filename = "carne.pdf") {
  const doc = await buildCarnePdf(opts);
  doc.save(filename);
}
