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
  { key: "empresa_cnpj", label: "CNPJ da empresa" },
  { key: "empresa_endereco", label: "Endereço da empresa" },
  { key: "valor_total", label: "Valor total da venda" },
  { key: "valor_total_extenso", label: "Valor total da venda por extenso" },
  { key: "valor_entrada", label: "Valor da entrada" },
  { key: "valor_entrada_extenso", label: "Valor da entrada por extenso" },
  { key: "valor_financiado", label: "Valor financiado" },
  { key: "valor_financiado_extenso", label: "Valor financiado por extenso" },
  { key: "valor_parcela", label: "Valor da parcela" },
  { key: "valor_parcela_extenso", label: "Valor da parcela por extenso" },
  { key: "parcelas", label: "Número de parcelas" },
  { key: "taxa_juros", label: "Taxa de juros (% a.m.)" },
  { key: "valor_dividas", label: "Valor total de dívidas (R$)" },
  { key: "valor_dividas_extenso", label: "Valor total de dívidas por extenso" },
  { key: "data", label: "Data atual (dd/mm/aaaa)" },
  { key: "data_extenso", label: "Data atual por extenso" },
  { key: "cidade", label: "Cidade do usuário logado" },
  { key: "primeiro_vencimento", label: "Vencimento da 1ª parcela (dd/mm/aaaa)" },
  { key: "primeiro_vencimento_extenso", label: "Vencimento da 1ª parcela por extenso" },
] as const;

const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Converte uma data para extenso. Ex.: "20 de abril de 2026" */
export function dataExtenso(d: Date = new Date()): string {
  return `${d.getDate()} de ${MESES_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

/** Máscara simples de telefone brasileiro: (11) 91234-5678 ou (11) 1234-5678 */
export function maskPhone(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ---------- Valor por extenso (Real brasileiro) ----------
const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ateMil(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto < 20) {
    if (resto > 0) partes.push(UNIDADES[resto]);
  } else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    let dz = DEZENAS[d];
    if (u > 0) dz += ` e ${UNIDADES[u]}`;
    partes.push(dz);
  }
  return partes.join(" e ");
}

/** Converte número em reais para extenso. Ex.: 1234.56 → "mil duzentos e trinta e quatro reais e cinquenta e seis centavos" */
export function valorExtenso(valor: number): string {
  if (!isFinite(valor) || valor < 0) return "";
  const inteiro = Math.floor(valor);
  const centavos = Math.round((valor - inteiro) * 100);

  const inteiroStr = (() => {
    if (inteiro === 0) return "zero";
    const milhoes = Math.floor(inteiro / 1_000_000);
    const milhares = Math.floor((inteiro % 1_000_000) / 1000);
    const resto = inteiro % 1000;
    const partes: string[] = [];
    if (milhoes > 0) partes.push(milhoes === 1 ? "um milhão" : `${ateMil(milhoes)} milhões`);
    if (milhares > 0) partes.push(milhares === 1 ? "mil" : `${ateMil(milhares)} mil`);
    if (resto > 0) partes.push(ateMil(resto));
    return partes.join(" e ");
  })();

  const reaisLabel = inteiro === 1 ? "real" : "reais";
  let result = `${inteiroStr} ${reaisLabel}`;
  if (centavos > 0) {
    const centLabel = centavos === 1 ? "centavo" : "centavos";
    result += ` e ${ateMil(centavos)} ${centLabel}`;
  }
  return result;
}
