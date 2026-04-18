import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Search, Loader2, User2, CheckCircle2, XCircle, Calculator,
} from "lucide-react";
import {
  maskCpf, brl, pricePmt, suggestedEntry, availableInstallments,
  minEntryForScore, rateForScore, amortizationSchedule,
  type SettingsLite, type ScoreTier,
} from "@/lib/finance";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface ConsultaResult {
  cpf: string;
  nome: string;
  score: number;
}

export default function Consulta() {
  const [cpf, setCpf] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConsultaResult | null>(null);
  const [consultaId, setConsultaId] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsLite | null>(null);

  // Venda
  const [valorTotal, setValorTotal] = useState<string>("");
  const [valorEntrada, setValorEntrada] = useState<string>("");
  const [parcelas, setParcelas] = useState<number | null>(null);
  const [savingVenda, setSavingVenda] = useState(false);

  useEffect(() => {
    supabase.from("settings").select("*").limit(1).maybeSingle().then(({ data }) => {
      if (data) setSettings({
        min_score: data.min_score,
        max_installments: data.max_installments,
        score_tiers: (data.score_tiers as unknown as ScoreTier[]) ?? [],
      });
    });
  }, []);

  const total = parseFloat(valorTotal.replace(",", ".")) || 0;
  const entrada = parseFloat(valorEntrada.replace(",", ".")) || 0;

  const aprovado = result && settings ? result.score >= settings.min_score : false;
  const minEntrada = result && settings && total > 0 ? minEntryForScore(total, result.score, settings) : 0;
  const sugerida = result && settings && total > 0 ? suggestedEntry(total, result.score, settings) : 0;
  const financiado = Math.max(total - entrada, 0);
  const taxaScore = result && settings ? rateForScore(result.score, settings) : 0;

  const opcoesParcelas = useMemo(() => settings ? availableInstallments(settings) : [], [settings]);

  const consultar = async () => {
    setBusy(true);
    setResult(null); setConsultaId(null);
    setValorTotal(""); setValorEntrada(""); setParcelas(null);
    try {
      const { data, error } = await supabase.functions.invoke("consulta-cpf", {
        body: { cpf: cpf.replace(/\D/g, "") },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setResult(data as ConsultaResult);
      // pega o id da consulta recém criada
      const { data: c } = await supabase
        .from("consultas")
        .select("id").eq("cpf", (data as ConsultaResult).cpf)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (c) setConsultaId(c.id);
      toast.success("Consulta concluída");
    } catch (e: unknown) {
      toast.error("Falha na consulta", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  // Aplica entrada sugerida sempre que valorTotal mudar
  useEffect(() => {
    if (result && settings && total > 0) {
      setValorEntrada(sugerida.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorTotal, result?.cpf]);

  const registrar = async (status: "aprovado" | "recusado") => {
    if (!result || !settings || !parcelas) return;
    if (entrada < minEntrada - 0.01) {
      toast.error("Entrada abaixo do mínimo", { description: `Mínimo: ${brl(minEntrada)}` });
      return;
    }
    const taxa = rateForScore(result.score, settings);
    const pmt = pricePmt(financiado, taxa, parcelas);
    setSavingVenda(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("vendas").insert({
      user_id: u.user!.id,
      consulta_id: consultaId,
      cpf: result.cpf,
      nome: result.nome,
      score: result.score,
      valor_total: total,
      valor_entrada: entrada,
      parcelas,
      taxa_juros: taxa,
      valor_parcela: pmt,
      valor_financiado: financiado,
      status,
    });
    setSavingVenda(false);
    if (error) { toast.error("Erro ao registrar", { description: error.message }); return; }
    toast.success(`Venda ${status} registrada`);
    // reset
    setResult(null); setCpf(""); setValorTotal(""); setValorEntrada(""); setParcelas(null);
  };

  return (
    <AppLayout>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Nova consulta</h1>
        <p className="text-muted-foreground">Informe o CPF do cliente para iniciar</p>
      </header>

      <Card className="shadow-card">
        <CardContent className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" placeholder="000.000.000-00" value={cpf}
                onChange={(e) => setCpf(maskCpf(e.target.value))} />
            </div>
            <Button onClick={consultar} disabled={busy || cpf.replace(/\D/g, "").length !== 11}
              size="lg" className="bg-gradient-primary">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="mr-2 h-4 w-4" />Consultar</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && settings && (
        <>
          <Card className="mt-6 shadow-elegant overflow-hidden">
            <div className={`h-1 ${aprovado ? "bg-success" : "bg-destructive"}`} />
            <CardContent className="p-6">
              <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-2 flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <User2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Cliente</p>
                    <p className="text-xl font-bold">{result.nome}</p>
                    <p className="text-sm text-muted-foreground">CPF: {maskCpf(result.cpf)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Score Serasa</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <p className={`text-4xl font-bold ${aprovado ? "text-success" : "text-destructive"}`}>{result.score}</p>
                    {aprovado
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"><CheckCircle2 className="h-3 w-3" />Aprovado</span>
                      : <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"><XCircle className="h-3 w-3" />Recusado</span>
                    }
                  </div>
                  <p className="text-xs text-muted-foreground">Mínimo aceito: {settings.min_score}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {aprovado && (
            <Card className="mt-6 shadow-card">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Simulação da venda</h2>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="total">Valor da venda (R$)</Label>
                    <Input id="total" inputMode="decimal" value={valorTotal}
                      onChange={(e) => setValorTotal(e.target.value)} placeholder="0,00" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="entrada">
                      Entrada (R$) — sugerida: <span className="font-semibold text-accent">{brl(sugerida)}</span>
                    </Label>
                    <Input id="entrada" inputMode="decimal" value={valorEntrada}
                      onChange={(e) => setValorEntrada(e.target.value)} placeholder="0,00" />
                    <p className="text-xs text-muted-foreground">
                      Entrada mínima conforme score: {brl(minEntrada)}
                    </p>
                    {entrada > 0 && entrada < minEntrada - 0.01 && (
                      <p className="text-xs text-destructive">Entrada abaixo do mínimo permitido</p>
                    )}
                  </div>
                </div>

                {total > 0 && entrada >= minEntrada - 0.01 && financiado > 0 && (
                  <>
                    <div className="mt-6">
                      <Label>Parcelas</Label>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                        {opcoesParcelas.map((n) => {
                          const taxa = taxaScore;
                          const pmt = pricePmt(financiado, taxa, n);
                          const ativo = parcelas === n;
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setParcelas(n)}
                              className={`rounded-lg border p-3 text-left transition-all ${
                                ativo
                                  ? "border-primary bg-primary text-primary-foreground shadow-elegant"
                                  : "border-border bg-card hover:border-primary/40"
                              }`}
                            >
                              <p className="text-xs opacity-80">{n}x</p>
                              <p className="font-bold">{brl(pmt)}</p>
                              <p className="text-[10px] opacity-70">{taxa}% a.m.</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {parcelas && (
                      <div className="mt-6 rounded-lg border bg-muted/30 p-4">
                        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                          <div><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold">{brl(total)}</p></div>
                          <div><p className="text-xs text-muted-foreground">Entrada</p><p className="font-semibold">{brl(entrada)}</p></div>
                          <div><p className="text-xs text-muted-foreground">Financiado</p><p className="font-semibold">{brl(financiado)}</p></div>
                          <div><p className="text-xs text-muted-foreground">{parcelas}x de</p><p className="font-bold text-accent">{brl(pricePmt(financiado, taxaScore, parcelas))}</p></div>
                        </div>
                      </div>
                    )}

                    <div className="mt-6 flex gap-3">
                      <Button onClick={() => registrar("aprovado")} disabled={!parcelas || savingVenda}
                        className="bg-success hover:bg-success/90 text-success-foreground">
                        Registrar venda aprovada
                      </Button>
                      <Button onClick={() => registrar("recusado")} disabled={!parcelas || savingVenda}
                        variant="outline">
                        Marcar como recusada
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </AppLayout>
  );
}
