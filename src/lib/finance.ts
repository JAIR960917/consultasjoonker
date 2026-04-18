// Helpers de cálculo financeiro (Tabela Price) e máscara CPF.

export interface SettingsLite {
  min_entry_percent: number;
  min_score: number;
  good_score: number;
  installment_rates: Record<string, number>; // chave string, valor = taxa mensal %
  max_installments: number;
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

/** Tabela Price: PMT = PV * i / (1 - (1+i)^-n) */
export function pricePmt(pv: number, monthlyRatePct: number, n: number): number {
  if (n <= 0) return 0;
  const i = monthlyRatePct / 100;
  if (i === 0) return pv / n;
  return (pv * i) / (1 - Math.pow(1 + i, -n));
}

export function suggestedEntry(total: number, score: number, settings: SettingsLite): number {
  // Entrada sugerida sobe se score for ruim. Para score >= good_score sugere o mínimo;
  // para score < min_score retorna 100% (não financia).
  if (score < settings.min_score) return total;
  if (score >= settings.good_score) return total * (settings.min_entry_percent / 100);
  // interpolação linear
  const ratio = (settings.good_score - score) / (settings.good_score - settings.min_score);
  // sugere entre min_entry_percent e min_entry_percent + 30 pontos
  const pct = settings.min_entry_percent + ratio * 30;
  return total * (Math.min(pct, 90) / 100);
}

export function availableInstallments(settings: SettingsLite): number[] {
  return Object.keys(settings.installment_rates)
    .map((k) => parseInt(k, 10))
    .filter((n) => !Number.isNaN(n) && n >= 1 && n <= settings.max_installments)
    .sort((a, b) => a - b);
}

export function rateFor(installments: number, settings: SettingsLite): number {
  return settings.installment_rates[String(installments)] ?? 0;
}
