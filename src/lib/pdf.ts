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
}

/**
 * Gera o PDF no mesmo layout exibido na tela (Nota Promissória):
 * fundo branco, letras pretas, título centralizado com subtítulo da empresa,
 * corpo do texto e duas linhas de assinatura (emitente / contratado).
 */
export function buildContractPdf(d: PdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 56;
  const usableWidth = pageWidth - margin * 2;

  // Cabeçalho — título e nome da empresa
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(d.title.toUpperCase(), pageWidth / 2, margin + 6, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(d.companyName.toUpperCase(), pageWidth / 2, margin + 24, { align: "center" });

  // Corpo do contrato
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);

  const paragraphs = d.content.split(/\n+/);
  const lineHeight = 16;
  let y = margin + 60;

  for (const paragraph of paragraphs) {
    const lines = doc.splitTextToSize(paragraph.trim(), usableWidth);
    for (const line of lines) {
      if (y > pageHeight - margin - 140) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += 6; // espaçamento entre parágrafos
  }

  // Garante espaço para o bloco de assinaturas
  if (y > pageHeight - 180) {
    doc.addPage();
    y = margin;
  }
  y += 40;

  // Bloco de assinaturas — duas colunas
  const colWidth = (usableWidth - 40) / 2;
  const sigY = y + 50;

  doc.setDrawColor(0);
  doc.setLineWidth(0.6);

  // Emitente
  doc.line(margin, sigY, margin + colWidth, sigY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text("Assinatura do emitente", margin + colWidth / 2, sigY + 14, { align: "center" });

  if (d.signedAt) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 130, 60);
    doc.setFontSize(9);
    doc.text(`✓ Assinado em ${d.signedAt}`, margin + colWidth / 2, sigY + 30, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  // Contratado
  const x2 = margin + colWidth + 40;
  doc.line(x2, sigY, x2 + colWidth, sigY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(d.companyName.toUpperCase(), x2 + colWidth / 2, sigY + 14, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (d.companyCnpj) {
    doc.text(`CNPJ: ${d.companyCnpj}`, x2 + colWidth / 2, sigY + 28, { align: "center" });
  }
  doc.setTextColor(110, 110, 110);
  doc.text("CONTRATADO", x2 + colWidth / 2, sigY + 44, { align: "center" });
  doc.setTextColor(0, 0, 0);

  // Rodapé com numeração
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
