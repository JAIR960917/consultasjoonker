import jsPDF from "jspdf";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

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
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

/** Gera dataURL PNG de QR Code (ECC M, ~140px). */
async function qrDataUrl(text: string): Promise<string> {
  return await QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 280,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

/** Gera dataURL PNG do código de barras ITF (padrão boleto bancário) a partir da linha digitável. */
function barcodeDataUrl(linhaDigitavel: string): string | null {
  // Extrai só dígitos: a linha tem 47 dígitos -> converter em código de barras de 44 dígitos
  const digits = (linhaDigitavel || "").replace(/\D/g, "");
  if (digits.length !== 47) return null;
  // Reorganiza 47 -> 44 (padrão FEBRABAN)
  const campo1 = digits.slice(0, 9); // sem DV (pos 9)
  const campo2 = digits.slice(10, 20); // sem DV (pos 20)
  const campo3 = digits.slice(21, 31); // sem DV (pos 31)
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
      width: 1.2,
      margin: 0,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/**
 * Gera o carnê: cada página A4 contém 1 boleto no layout da Cora (cabeçalho com
 * linha digitável, dados, valor, código de barras) + QR Code Pix ao lado.
 * Pronto para imprimir e recortar.
 */
export async function buildCarnePdf(opts: CarneOptions): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 30;

  for (let idx = 0; idx < opts.parcelas.length; idx++) {
    if (idx > 0) doc.addPage();
    await drawBoleto(doc, opts, opts.parcelas[idx], margin, pageW, pageH);
  }

  // Rodapé com numeração
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(
      `Página ${i} de ${total} • Recorte na linha tracejada`,
      pageW / 2,
      pageH - 12,
      { align: "center" },
    );
    doc.setTextColor(0, 0, 0);
  }
  return doc;
}

async function drawBoleto(
  doc: jsPDF,
  { empresa, pagador }: CarneOptions,
  p: CarneParcela,
  margin: number,
  pageW: number,
  _pageH: number,
) {
  const x = margin;
  let y = margin;
  const w = pageW - margin * 2;

  // ---------- Linha digitável ----------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("BOLETO BANCÁRIO", x, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Parcela ${p.numero_parcela}/${p.total_parcelas}`,
    x + w,
    y,
    { align: "right" },
  );
  y += 14;

  doc.setDrawColor(0);
  doc.setLineWidth(0.6);
  doc.line(x, y, x + w, y);
  y += 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(p.linha_digitavel ?? "Linha digitável indisponível", x + w, y, {
    align: "right",
  });
  y += 18;

  // ---------- Bloco de campos (estilo Cora) ----------
  const blockTop = y;
  const colSplit = x + w * 0.62; // divisão para coluna Vencimento
  const rowH = 28;

  const drawCell = (
    cx: number,
    cy: number,
    cw: number,
    label: string,
    value: string,
    opts?: { bold?: boolean; align?: "left" | "right"; fontSize?: number },
  ) => {
    doc.setDrawColor(180);
    doc.setLineWidth(0.4);
    doc.rect(cx, cy, cw, rowH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(80);
    doc.text(label, cx + 3, cy + 7);
    doc.setTextColor(0);
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(opts?.fontSize ?? 9);
    const align = opts?.align ?? "left";
    const tx = align === "right" ? cx + cw - 3 : cx + 3;
    doc.text(value, tx, cy + 21, { align });
  };

  // Linha 1: Local de pagamento | Vencimento
  drawCell(x, y, colSplit - x, "Local de Pagamento", "Pagável em qualquer agência bancária");
  drawCell(colSplit, y, x + w - colSplit, "Vencimento", fmtDateBR(p.vencimento), {
    bold: true,
    align: "right",
  });
  y += rowH;

  // Linha 2: Beneficiário | CNPJ | (vazio)
  drawCell(x, y, colSplit - x, "Beneficiário", empresa.nome);
  drawCell(colSplit, y, x + w - colSplit, "CPF/CNPJ do Beneficiário", maskCnpj(empresa.cnpj), {
    align: "right",
  });
  y += rowH;

  // Linha 3: Data documento | Nº documento | Espécie | Aceite | Nosso número
  const c1 = (x + w - x) / 5;
  drawCell(x, y, c1, "Data do Documento", fmtDateBR(new Date().toISOString().slice(0, 10)));
  drawCell(x + c1, y, c1, "Nr. do Documento", p.cora_invoice_id?.slice(0, 12) ?? "—");
  drawCell(x + c1 * 2, y, c1, "Espécie Doc", "DV");
  drawCell(x + c1 * 3, y, c1 * 0.5, "Aceite", "N");
  drawCell(x + c1 * 3.5, y, c1 * 1.5, "Nosso Número", p.nosso_numero ?? "—", {
    align: "right",
  });
  y += rowH;

  // Linha 4: Uso banco | Carteira | Espécie Moeda | Quantidade | Valor doc
  drawCell(x, y, c1, "Uso do Banco", "");
  drawCell(x + c1, y, c1, "Carteira", "01");
  drawCell(x + c1 * 2, y, c1, "Espécie Moeda", "R$");
  drawCell(x + c1 * 3, y, c1, "Quantidade Moeda", "");
  drawCell(x + c1 * 4, y, c1, "(=) Valor do Documento", fmtBRL(Number(p.valor)), {
    bold: true,
    align: "right",
  });
  y += rowH;

  // Bloco do pagador (caixa grande com 5 sub-linhas vazias à direita)
  const bigH = rowH * 5;
  const leftW = colSplit - x;
  doc.rect(x, y, leftW, bigH);
  // Sub-rótulos à direita (descontos/juros/multa/etc)
  const subLabels = [
    "(-) Desconto",
    "(-) Outras Deduções/Abatimento",
    "(+) Mora/Multa/Juros",
    "(+) Outros Acréscimos",
    "(=) Valor Cobrado",
  ];
  for (let i = 0; i < 5; i++) {
    drawCell(colSplit, y + rowH * i, x + w - colSplit, subLabels[i], "", {
      align: "right",
    });
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(80);
  doc.text("Pagador", x + 3, y + 7);
  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.text(`${pagador.nome} - CPF ${maskCpf(pagador.cpf)}`, x + 3, y + 22);
  doc.setFontSize(6.5);
  doc.setTextColor(80);
  doc.text("Sacador/Avalista", x + 3, y + 42);
  doc.setTextColor(0);
  y += bigH;

  // ---------- Código de barras ----------
  y += 6;
  if (p.linha_digitavel) {
    const bcUrl = barcodeDataUrl(p.linha_digitavel);
    if (bcUrl) {
      // largura padrão ~ 103mm; usamos ~ 360pt
      doc.addImage(bcUrl, "PNG", x, y, 360, 50);
    }
  }
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text("Autenticação Mecânica - Ficha de Compensação", x + w, y + 50, {
    align: "right",
  });
  doc.setTextColor(0);
  y += 70;

  // ---------- Linha tracejada (recorte) ----------
  doc.setLineDashPattern([3, 3], 0);
  doc.setDrawColor(140);
  doc.line(x, y, x + w, y);
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(0);
  y += 16;

  // ---------- Bloco PIX ----------
  if (p.pix_emv) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Pague com PIX", x, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(
      "Aponte a câmera do seu app bancário para o QR Code abaixo ou copie o código.",
      x,
      y + 12,
    );
    doc.setTextColor(0);

    const qr = await qrDataUrl(p.pix_emv);
    const qrSize = 130;
    doc.addImage(qr, "PNG", x, y + 20, qrSize, qrSize);

    // Dados ao lado do QR
    const ix = x + qrSize + 16;
    const iy = y + 28;
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text("Beneficiário", ix, iy);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(empresa.nome, ix, iy + 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text("Valor", ix, iy + 28);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(fmtBRL(Number(p.valor)), ix, iy + 42);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text("Vencimento", ix, iy + 58);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(fmtDateBR(p.vencimento), ix, iy + 70);

    // Código copia-e-cola (quebrado em linhas)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text("PIX Copia e Cola:", ix, iy + 90);
    doc.setTextColor(0);
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    const wrapped = doc.splitTextToSize(p.pix_emv, pageW - margin - ix);
    doc.text(wrapped.slice(0, 4), ix, iy + 100);
  }
}

export async function downloadCarnePdf(opts: CarneOptions, filename = "carne.pdf") {
  const doc = await buildCarnePdf(opts);
  doc.save(filename);
}
