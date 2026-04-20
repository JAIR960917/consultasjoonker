/** Substitui placeholders {{var}} no conteúdo do contrato pelos valores informados. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? `{{${key}}}` : String(v);
  });
}

export const AVAILABLE_VARS = [
  { key: "nome", label: "Nome do cliente" },
  { key: "cpf", label: "CPF formatado" },
  { key: "endereco", label: "Endereço completo" },
  { key: "telefone", label: "Telefone formatado" },
  { key: "empresa", label: "Nome da empresa" },
  { key: "valor_total", label: "Valor total da venda" },
  { key: "valor_entrada", label: "Valor da entrada" },
  { key: "valor_financiado", label: "Valor financiado" },
  { key: "valor_parcela", label: "Valor da parcela" },
  { key: "parcelas", label: "Número de parcelas" },
  { key: "taxa_juros", label: "Taxa de juros (% a.m.)" },
  { key: "data", label: "Data atual (dd/mm/aaaa)" },
] as const;

/** Máscara simples de telefone brasileiro: (11) 91234-5678 ou (11) 1234-5678 */
export function maskPhone(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
