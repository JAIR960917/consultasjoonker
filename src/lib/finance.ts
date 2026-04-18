// Helpers de cálculo financeiro (Tabela Price), faixas de score e máscara CPF.

export interface ScoreTier {
  min: number;
  max: number;
  entry_percent: number; // % mínima de entrada exigida nessa faixa
  rate: number;          // taxa de juros mensal (%) aplicada nessa faixa
}

export interface SettingsLite {
  min_score: number;
  max_installments: number;
  score_tiers: ScoreTier[];
}

export function maskCpf(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Tabela Price: PMT = PV * i * (1+i)^n / ((1+i)^n - 1)
 *  Equivalente a PV * i / (1 - (1+i)^-n) */
export function pricePmt(pv: number, monthlyRatePct: number, n: number): number {
  if (n <= 0) return 0;
  const i = monthlyRatePct / 100;
  if (i === 0) return pv / n;
  const f = Math.pow(1 + i, n);
  return (pv * i * f) / (f - 1);
}

export interface AmortRow {
  mes: number;
  parcela: number;
  juros: number;
  amortizacao: number;
  saldo: number;
}

/** Gera a tabela de amortização (Sistema Price) mês a mês. */
export function amortizationSchedule(pv: number, monthlyRatePct: number, n: number): AmortRow[] {
  const rows: AmortRow[] = [];
  if (pv <= 0 || n <= 0) return rows;
  const i = monthlyRatePct / 100;
  const pmt = pricePmt(pv, monthlyRatePct, n);
  let saldo = pv;
  for (let m = 1; m <= n; m++) {
    const juros = saldo * i;
    let amort = pmt - juros;
    // Ajuste de arredondamento na última parcela
    if (m === n) amort = saldo;
    saldo = Math.max(saldo - amort, 0);
    rows.push({
      mes: m,
      parcela: m === n ? juros + amort : pmt,
      juros,
      amortizacao: amort,
      saldo,
    });
  }
  return rows;
}

/** Localiza a faixa de score aplicável. */
export function tierForScore(score: number, settings: SettingsLite): ScoreTier | null {
  const tiers = [...(settings.score_tiers ?? [])].sort((a, b) => a.min - b.min);
  return tiers.find((t) => score >= t.min && score <= t.max) ?? null;
}

/** Entrada mínima em R$ baseada na faixa do score. */
export function minEntryForScore(total: number, score: number, settings: SettingsLite): number {
  const tier = tierForScore(score, settings);
  if (!tier) return total;
  return total * (tier.entry_percent / 100);
}

/** Entrada sugerida = exatamente o mínimo da faixa (operador pode aumentar). */
export function suggestedEntry(total: number, score: number, settings: SettingsLite): number {
  return minEntryForScore(total, score, settings);
}

/** Taxa de juros mensal (%) baseada na faixa do score. */
export function rateForScore(score: number, settings: SettingsLite): number {
  const tier = tierForScore(score, settings);
  return tier?.rate ?? 0;
}

/** Lista de parcelas disponíveis (1..max_installments). */
export function availableInstallments(settings: SettingsLite): number[] {
  const max = Math.max(1, settings.max_installments || 1);
  return Array.from({ length: max }, (_, i) => i + 1);
}
