import jsPDF from "jspdf";

interface PdfData {
  title: string;
  companyName: string;
  companyCnpj: string;
  companyAddress: string;
  clientName: string;
  clientCpf: string;
  content: string;
  signedAt?: string | null;
  vencimento?: string | null; // ex.: "20/05/2026"
  valorTotal?: string | null; // ex.: "R$ 900,00"
  numero?: string | null;     // ex.: "Nº 1 DE 1"
}

/**
 * Gera o PDF no mesmo layout da tela (Nota Promissória):
 * fundo branco, letras pretas, título centralizado com "Nº X DE Y" ao lado,
 * vencimento e valor total no canto superior direito,
 * corpo do contrato e UMA única linha de assinatura do emitente.
 */
export function buildContractPdf(d: PdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const usableWidth = pageWidth - margin * 2;

  doc.setTextColor(0, 0, 0);

  // ---- Cabeçalho ----
  // Título centralizado + "Nº 1 DE 1" ao lado
  const titleText = d.title.toUpperCase();
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

  // Vencimento / Valor total no canto superior direito
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
  doc.setTextColor(0, 0, 0);

  const rawLines = d.content.split("\n");
  const lineHeight = 16;
  const rightColumnWidth = 220;
  const gapBetweenColumns = 16;
  const leftColumnWidth = usableWidth - rightColumnWidth - gapBetweenColumns;
  let y = margin + 50;

  for (const rawLine of rawLines) {
    const paragraph = rawLine.trim();

    if (!paragraph) {
      y += 8;
      continue;
    }

    const cityDateMatch = rawLine.match(/^(.*?)([A-Za-zÀ-ÿ\s.-]+-[A-Z]{2}\s*,\s*\d{1,2}\s+de\s+[A-Za-zÀ-ÿ]+\s+de\s+\d{4})\s*$/);
    const spacedColumnsMatch = rawLine.match(/^(.*?)\s{3,}(.+)$/);
    const columnMatch = cityDateMatch
      ? [rawLine, cityDateMatch[1], cityDateMatch[2]]
      : spacedColumnsMatch;
      const leftText = columnMatch[1].trim();
      const rightText = columnMatch[2].trim();
      const leftLines = leftText ? doc.splitTextToSize(leftText, leftColumnWidth) : [""];
      const rightLines = doc.splitTextToSize(rightText, rightColumnWidth);
      const totalLines = Math.max(leftLines.length, rightLines.length);

      for (let i = 0; i < totalLines; i++) {
        if (y > pageHeight - margin - 120) {
          doc.addPage();
          y = margin;
        }

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
      if (y > pageHeight - margin - 120) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += 6;
  }

  // ---- Assinatura única (emitente) ----
  if (y > pageHeight - 140) {
    doc.addPage();
    y = margin;
  }
  y += 50;

  const sigWidth = 280;
  const sigX = (pageWidth - sigWidth) / 2;
  const sigY = y;

  doc.setDrawColor(0);
  doc.setLineWidth(0.6);
  doc.line(sigX, sigY, sigX + sigWidth, sigY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Assinatura do emitente", pageWidth / 2, sigY + 14, { align: "center" });

  if (d.signedAt) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 130, 60);
    doc.setFontSize(9);
    doc.text(`✓ Assinado em ${d.signedAt}`, pageWidth / 2, sigY + 30, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  // ---- Rodapé com numeração ----
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Página ${i} de ${total}`, pageWidth - margin, pageHeight - 20, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  return doc;
}

export function downloadContractPdf(data: PdfData, filename = "contrato.pdf") {
  const doc = buildContractPdf(data);
  doc.save(filename);
}
