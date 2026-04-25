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
  try {
    doc.addImage(logoImg, "JPEG", x, y, 28, 8);
  } catch {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(232, 64, 95);
    doc.text("cora", x, y + 7);
    doc.setTextColor(0);
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
  bx: number,
  by: number,
  bw: number,
) {
  const { empresa, pagador } = opts;

  // 2 colunas: recibo (esq ~22%) | ficha de compensação (dir ~78%)
  const colReciboW = bw * 0.22;
  const colCompW = bw - colReciboW;

  const xRec = bx;
  const xComp = bx + colReciboW;

  // Header row (logo Cora em cada coluna + linha digitável à direita)
  const headerH = 14;
  coraHeader(doc, xRec + 2, by + 3, logoImg);
  coraHeader(doc, xComp + 4, by + 3, logoImg);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text(p.linha_digitavel ?? "—", xComp + colCompW - 2, by + 9, { align: "right" });

  /* ============ RECIBO DO PAGADOR (esquerda) ============ */
  let y = by + headerH;
  const recRow = 14;
  const halfW = colReciboW / 2;

  cell(doc, xRec, y, halfW, recRow, "Parcela/Plano", `${p.numero_parcela}/${p.total_parcelas}`, { bold: true });
  cell(doc, xRec + halfW, y, halfW, recRow, "Vencimento", fmtDateBR(p.vencimento), { bold: true, align: "right" });
  y += recRow;
  cell(doc, xRec, y, colReciboW, recRow, "Nosso número", p.nosso_numero ?? "—", { align: "right", valueSize: 7 });
  y += recRow;
  cell(doc, xRec, y, colReciboW, recRow, "Número do documento", p.numero_documento ?? "—", { align: "right" });
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
  cell(doc, xRec, y, colReciboW, recRow, "Pagador", pagador.nome, { valueSize: 7 });
  y += recRow;
  cell(doc, xRec, y, colReciboW, recRow * 1.6, "Beneficiário", "", { border: true });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(0);
  doc.text(empresa.nome, xRec + 2, y + 12);
  doc.text(maskCnpj(empresa.cnpj), xRec + 2, y + 20);

  const recH = (y + recRow * 1.6) - by;

  /* ============ DIVISÓRIA TRACEJADA ESQ↔CENTRO ============ */
  dashedLine(doc, xComp, by, xComp, by + recH);

  /* ============ FICHA DE COMPENSAÇÃO ============ */
  let cy = by + headerH;
  const compRow = 14;

  // Linha 1: Local de pagamento | Vencimento (à direita)
  const c1L = colCompW * 0.80;
  cell(doc, xComp, cy, c1L, compRow, "Local de Pagamento", "Pagável em qualquer agência bancária");
  cell(doc, xComp + c1L, cy, colCompW - c1L, compRow, "Vencimento", fmtDateBR(p.vencimento), { bold: true, align: "right" });
  cy += compRow;

  // Linha 2: Beneficiário | CNPJ | Agência/Código
  const c2a = colCompW * 0.55;
  const c2b = colCompW * 0.25;
  const c2c = colCompW - c2a - c2b;
  cell(doc, xComp, cy, c2a, compRow, "Beneficiário", empresa.nome);
  cell(doc, xComp + c2a, cy, c2b, compRow, "CNPJ/CPF do beneficiário", maskCnpj(empresa.cnpj), { align: "right" });
  cell(doc, xComp + c2a + c2b, cy, c2c, compRow, "Agência/Código do beneficiário", "0001", { align: "right" });
  cy += compRow;

  // Linha 3: Data doc | Nº doc | Espécie | Aceite | Nosso número
  const c3 = [colCompW * 0.18, colCompW * 0.20, colCompW * 0.10, colCompW * 0.08];
  c3.push(colCompW - c3.reduce((a, b) => a + b, 0));
  let cx = xComp;
  cell(doc, cx, cy, c3[0], compRow, "Data do documento", fmtDateBR(opts.data_emissao ?? new Date().toISOString().slice(0, 10))); cx += c3[0];
  cell(doc, cx, cy, c3[1], compRow, "Número do documento", p.numero_documento ?? "—"); cx += c3[1];
  cell(doc, cx, cy, c3[2], compRow, "Espécie doc.", "DV"); cx += c3[2];
  cell(doc, cx, cy, c3[3], compRow, "Aceite", "N"); cx += c3[3];
  cell(doc, cx, cy, c3[4], compRow, "Nosso número", p.nosso_numero ?? "—", { align: "right", valueSize: 7 });
  cy += compRow;

  // Linha 4: Carteira | Espécie moeda | Quantidade | Valor | (=) Valor doc
  cx = xComp;
  cell(doc, cx, cy, c3[0], compRow, "Carteira", "01"); cx += c3[0];
  cell(doc, cx, cy, c3[1], compRow, "Espécie moeda", "R$"); cx += c3[1];
  cell(doc, cx, cy, c3[2], compRow, "Quantidade", ""); cx += c3[2];
  cell(doc, cx, cy, c3[3], compRow, "Valor", ""); cx += c3[3];
  cell(doc, cx, cy, c3[4], compRow, "(=) Valor do documento", fmtBRL(Number(p.valor)), { bold: true, align: "right" });
  cy += compRow;

  // Bloco grande (descrição + sub-rows à direita)
  const bigW = c3[0] + c3[1] + c3[2] + c3[3];
  const subRowH = 14;
  const bigH = subRowH * 5;
  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.rect(xComp, cy, bigW, bigH);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(0);
  const descPrefix = opts.descricao ? `${opts.descricao} ` : "";
  doc.text(`${descPrefix}Parcela ${p.numero_parcela}/${p.total_parcelas}`, xComp + 4, cy + 14);
  doc.setFontSize(7.5);
  const aviso = doc.splitTextToSize(
    "Após o vencimento, aplicar multa de R$ 0,20 e juros de 1,00% ao mês.",
    bigW - 8,
  );
  doc.text(aviso, xComp + 4, cy + 26);

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

  // Pagador (full)
  cell(doc, xComp, cy, colCompW, compRow, "Pagador", `${pagador.nome} - CPF ${maskCpf(pagador.cpf)}`);
  cy += compRow;

  // Sacador/Avalista
  cell(doc, xComp, cy, colCompW, compRow, "Sacador/Avalista", "");
  cy += compRow + 4;

  /* ===== Faixa final: código de barras (esq) + QR Pix (dir) ===== */
  const qrBoxW = colCompW * 0.16;
  const bcW = colCompW - qrBoxW - 6;
  const bcH = 36;

  // Código de barras
  if (p.linha_digitavel) {
    const bcUrl = barcodeDataUrl(p.linha_digitavel);
    if (bcUrl) {
      doc.addImage(bcUrl, "PNG", xComp + 2, cy, bcW, bcH);
    }
  }

  // QR Pix à direita
  if (p.pix_emv) {
    try {
      const qr = await qrDataUrl(p.pix_emv);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(0);
      doc.text("Pague este boleto via PIX", xComp + colCompW - qrBoxW / 2, cy - 2, { align: "center" });
      const qrSize = Math.min(qrBoxW - 4, bcH);
      const qx = xComp + colCompW - qrBoxW + (qrBoxW - qrSize) / 2;
      doc.addImage(qr, "PNG", qx, cy, qrSize, qrSize);
    } catch {
      /* ignore */
    }
  }

  cy += bcH + 2;
  doc.setFontSize(6.5);
  doc.setTextColor(120);
  doc.text("Autenticação mecânica - Ficha de compensação", xComp + 2, cy + 6);
  doc.setTextColor(0);

  const compH = (cy + 10) - by;
  const blockH = Math.max(recH, compH);

  return blockH;
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

  // Layout: ~3 boletos por página A4 (após o header da pág 1)
  const topHeaderH = 130; // altura do "Essa é a sua cobrança" na pág 1
  const boletoH = 240; // altura estimada de cada boleto

  let cursorY = margin + topHeaderH;
  drawTopHeader(doc, opts, logo, margin, pageW);

  for (let i = 0; i < opts.parcelas.length; i++) {
    const remaining = pageH - margin - cursorY;
    if (remaining < boletoH) {
      doc.addPage();
      cursorY = margin;
    }
    const usedH = await drawBoletoBlock(doc, opts, opts.parcelas[i], logo, margin, cursorY, usableW);
    cursorY += usedH + 4;
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
