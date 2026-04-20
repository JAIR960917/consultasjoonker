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

/** Gera o PDF do contrato e retorna um Blob (para upload) ou aciona download. */
export function buildContractPdf(d: PdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 56;
  const usableWidth = pageWidth - margin * 2;

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(d.title.toUpperCase(), pageWidth / 2, margin, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(d.companyName, pageWidth / 2, margin + 16, { align: "center" });
  doc.setTextColor(0);

  // Corpo
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(d.content, usableWidth);
  let y = margin + 50;
  const lineHeight = 16;

  for (const line of lines) {
    if (y > pageHeight - margin - 120) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  }

  // Assinaturas
  if (y > pageHeight - 180) {
    doc.addPage();
    y = margin;
  }
  y += 40;

  const colWidth = (usableWidth - 40) / 2;
  const sigY = y + 50;

  // Linha contratante
  doc.setDrawColor(0);
  doc.line(margin, sigY, margin + colWidth, sigY);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Assinatura do emitente", margin + colWidth / 2, sigY + 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  if (d.signedAt) {
    doc.setTextColor(20, 130, 60);
    doc.setFontSize(9);
    doc.text(`✓ Assinado em ${d.signedAt}`, margin + colWidth / 2, sigY + 30, { align: "center" });
    doc.setTextColor(0);
  }

  // Linha contratado
  const x2 = margin + colWidth + 40;
  doc.line(x2, sigY, x2 + colWidth, sigY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(d.companyName, x2 + colWidth / 2, sigY + 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (d.companyCnpj) doc.text(`CNPJ: ${d.companyCnpj}`, x2 + colWidth / 2, sigY + 28, { align: "center" });
  if (d.companyAddress) {
    const addrLines = doc.splitTextToSize(d.companyAddress, colWidth);
    doc.text(addrLines, x2 + colWidth / 2, sigY + 40, { align: "center" });
  }
  doc.setTextColor(120);
  doc.text("CONTRATADO", x2 + colWidth / 2, sigY + 60, { align: "center" });
  doc.setTextColor(0);

  // Rodapé com numeração
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Página ${i} de ${total}`, pageWidth - margin, pageHeight - 20, { align: "right" });
    doc.setTextColor(0);
  }

  return doc;
}

export function downloadContractPdf(data: PdfData, filename = "contrato.pdf") {
  const doc = buildContractPdf(data);
  doc.save(filename);
}
