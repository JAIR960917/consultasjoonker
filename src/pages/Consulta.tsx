import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Search, Loader2, User2, CheckCircle2, XCircle, Calculator, Printer, AlertTriangle,
} from "lucide-react";
import {
  maskCpf, brl, pricePmt, suggestedEntry, availableInstallments,
  minEntryForScore, rateForScore, amortizationSchedule,
  type SettingsLite, type ScoreTier,
} from "@/lib/finance";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SaleAddressDialog, type AddressData } from "@/components/SaleAddressDialog";
import { fillTemplate, valorExtenso } from "@/lib/contract";

interface Pendencia {
  credor: string;
  valor: number;
  data: string | null;
  tipo: string;
  contrato?: string;
}

interface ConsultaResult {
  cpf: string;
  nome: string;
  score: number;
  pendencias?: Pendencia[];
  totalPendencias?: number;
  somaPendencias?: number;
}

export default function Consulta() {
  const nav = useNavigate();
  const [cpf, setCpf] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConsultaResult | null>(null);
  const [consultaId, setConsultaId] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsLite | null>(null);

  // Simulação
  const [modoSimulacao, setModoSimulacao] = useState(false);
  const [simNome, setSimNome] = useState("");
  const [simNascimento, setSimNascimento] = useState("");
  const [simScore, setSimScore] = useState<string>("850");

  // Venda
  const [valorTotal, setValorTotal] = useState<string>("");
  const [valorEntrada, setValorEntrada] = useState<string>("");
  const [parcelas, setParcelas] = useState<number | null>(null);
  const [savingVenda, setSavingVenda] = useState(false);

  // Dialog endereço/telefone
  const [addressOpen, setAddressOpen] = useState(false);

  useEffect(() => {
    supabase.from("settings").select("*").limit(1).maybeSingle().then(({ data }) => {
      if (data) {
        const raw = (data.score_tiers as unknown as Array<Partial<ScoreTier> & { entry_percent?: number }>) ?? [];
        const tiers: ScoreTier[] = raw.map((t) => {
          const min_pct = t.entry_min_percent ?? t.entry_percent ?? 0;
          const sug_pct = t.entry_suggested_percent ?? t.entry_percent ?? min_pct;
          return {
            min: t.min ?? 0,
            max: t.max ?? 0,
            entry_suggested_percent: sug_pct,
            entry_min_percent: min_pct,
            rate: t.rate ?? 0,
          };
        });
        setSettings({
          min_score: data.min_score,
          max_installments: data.max_installments,
          score_tiers: tiers,
        });
      }
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
      const payload: Record<string, unknown> = { cpf: cpf.replace(/\D/g, "") };
      if (modoSimulacao) {
        payload.simulacao = true;
        payload.nome = simNome.trim() || "Cliente Simulado";
        payload.dataNascimento = simNascimento || null;
        const s = parseInt(simScore, 10);
        payload.score = Number.isFinite(s) ? s : 850;
      }
      const { data, error } = await supabase.functions.invoke("consulta-cpf", { body: payload });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setResult(data as ConsultaResult);
      // pega o id da consulta recém criada
      const { data: c } = await supabase
        .from("consultas")
        .select("id").eq("cpf", (data as ConsultaResult).cpf)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (c) setConsultaId(c.id);
      toast.success(modoSimulacao ? "Simulação carregada" : "Consulta concluída");
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

  /** Para vendas aprovadas, abre o dialog de endereço/telefone antes de registrar. */
  const handleRegistrarAprovada = () => {
    if (!result || !settings || !parcelas) return;
    if (entrada < minEntrada - 0.01) {
      toast.error("Entrada insuficiente", {
        description: "O valor informado é menor que o exigido para essa faixa de score. Aumente a entrada e tente novamente.",
      });
      return;
    }
    setAddressOpen(true);
  };

  /** Cria venda + contrato e leva o vendedor para a tela do contrato. */
  const confirmarVendaComEndereco = async (endereco: AddressData) => {
    if (!result || !settings || !parcelas) return;
    setAddressOpen(false);
    setSavingVenda(true);
    try {
      const taxa = rateForScore(result.score, settings);
      const pmt = pricePmt(financiado, taxa, parcelas);
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user!.id;

      // 1) registra a venda
      const { data: vendaIns, error: vendaErr } = await supabase
        .from("vendas")
        .insert({
          user_id: userId,
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
          status: "aprovado",
        })
        .select("id")
        .single();
      if (vendaErr) throw vendaErr;

      // 2) busca modelo atual e gera o conteúdo final
      const { data: tpl, error: tplErr } = await supabase
        .from("contract_template")
        .select("content, company_name, company_cnpj, company_address")
        .limit(1)
        .maybeSingle();
      if (tplErr) throw tplErr;
      if (!tpl) throw new Error("Modelo de contrato não configurado.");

      const somaDividas = result.somaPendencias ?? 0;
      const filled = fillTemplate(tpl.content, {
        nome: result.nome,
        cpf: maskCpf(result.cpf),
        endereco: endereco.endereco,
        telefone: endereco.telefone,
        empresa: tpl.company_name,
        empresa_cnpj: tpl.company_cnpj || "",
        empresa_endereco: tpl.company_address || "",
        valor_total: brl(total).replace("R$", "").trim(),
        valor_total_extenso: valorExtenso(total),
        valor_entrada: brl(entrada).replace("R$", "").trim(),
        valor_entrada_extenso: valorExtenso(entrada),
        valor_financiado: brl(financiado).replace("R$", "").trim(),
        valor_financiado_extenso: valorExtenso(financiado),
        valor_parcela: brl(pmt).replace("R$", "").trim(),
        valor_parcela_extenso: valorExtenso(pmt),
        parcelas,
        taxa_juros: taxa.toFixed(2).replace(".", ","),
        valor_dividas: brl(somaDividas).replace("R$", "").trim(),
        valor_dividas_extenso: valorExtenso(somaDividas),
        data: new Date().toLocaleDateString("pt-BR"),
      });

      // 3) cria o contrato
      const { data: contractIns, error: contractErr } = await supabase
        .from("contracts")
        .insert({
          user_id: userId,
          venda_id: vendaIns.id,
          consulta_id: consultaId,
          cpf: result.cpf,
          nome: result.nome,
          endereco: endereco.endereco,
          telefone: endereco.telefone,
          content: filled,
          status: "pendente",
        })
        .select("id")
        .single();
      if (contractErr) throw contractErr;

      toast.success("Venda registrada — contrato gerado");
      nav(`/contrato/${contractIns.id}`);
    } catch (e: unknown) {
      toast.error("Erro ao registrar venda", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSavingVenda(false);
    }
  };

  /** Recusada: registra direto, sem contrato. */
  const registrarRecusada = async () => {
    if (!result || !settings || !parcelas) return;
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
      status: "recusado",
    });
    setSavingVenda(false);
    if (error) { toast.error("Erro ao registrar", { description: error.message }); return; }
    toast.success("Venda recusada registrada");
    setResult(null); setCpf(""); setValorTotal(""); setValorEntrada(""); setParcelas(null);
  };

  return (
    <AppLayout>
      <header className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nova consulta</h1>
          <p className="text-muted-foreground">Informe o CPF do cliente para iniciar</p>
        </div>
        {result && (
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />Imprimir / PDF
          </Button>
        )}
      </header>

      <Card className="shadow-card print:hidden">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div>
              <p className="text-sm font-medium">Modo simulação</p>
              <p className="text-xs text-muted-foreground">
                Use para simular uma venda sem consultar o Serasa (ex.: testes/treinamento).
              </p>
            </div>
            <Switch checked={modoSimulacao} onCheckedChange={setModoSimulacao} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" placeholder="000.000.000-00" value={cpf}
                onChange={(e) => setCpf(maskCpf(e.target.value))} />
            </div>
            <Button onClick={consultar} disabled={busy || cpf.replace(/\D/g, "").length !== 11}
              size="lg" className="bg-gradient-primary">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="mr-2 h-4 w-4" />{modoSimulacao ? "Simular" : "Consultar"}</>}
            </Button>
          </div>

          {modoSimulacao && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sim-nome">Nome completo</Label>
                <Input id="sim-nome" placeholder="Nome do cliente" value={simNome}
                  onChange={(e) => setSimNome(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sim-nasc">Data de nascimento</Label>
                <Input id="sim-nasc" type="date" value={simNascimento}
                  onChange={(e) => setSimNascimento(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sim-score">Score (0–1000)</Label>
                <Input id="sim-score" inputMode="numeric" value={simScore}
                  onChange={(e) => setSimScore(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="sm:col-span-2 flex items-end">
                <p className="text-xs text-muted-foreground">
                  Dica para teste: CPF <span className="font-mono">124.036.644-21</span>, Jair Azevedo da Silva Filho, 29/03/2001.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {result && settings && (
        <>
          <Card className="mt-6 shadow-elegant overflow-hidden">
            <div className={`h-1 ${aprovado ? "bg-emerald-500" : "bg-destructive"}`} />
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
                    <p className={`text-4xl font-bold ${aprovado ? "text-emerald-500" : "text-destructive"}`}>{result.score}</p>
                    {aprovado
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500"><CheckCircle2 className="h-3 w-3" />Aprovado</span>
                      : <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"><XCircle className="h-3 w-3" />Recusado</span>
                    }
                  </div>
                  <p className="text-xs text-muted-foreground">Mínimo aceito: {settings.min_score}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card de pendências (PEFIN/REFIN) */}
          {result.pendencias && result.pendencias.length > 0 ? (
            <Card className="mt-6 shadow-card overflow-hidden">
              <div className="h-1 bg-destructive" />
              <CardContent className="p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <h2 className="text-lg font-semibold">Pendências financeiras</h2>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{result.totalPendencias} ocorrência(s)</p>
                    <p className="text-base font-bold text-destructive">{brl(result.somaPendencias ?? 0)}</p>
                  </div>
                </div>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/60">
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Credor</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.pendencias.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{p.tipo}</TableCell>
                          <TableCell>{p.credor}{p.contrato ? <span className="text-muted-foreground"> · {p.contrato}</span> : null}</TableCell>
                          <TableCell className="text-muted-foreground">{p.data ?? "—"}</TableCell>
                          <TableCell className="text-right font-semibold">{brl(p.valor)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="mt-6 shadow-card overflow-hidden">
              <div className="h-1 bg-emerald-500" />
              <CardContent className="p-6 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="font-semibold">Sem pendências financeiras</p>
                  <p className="text-sm text-muted-foreground">Não foram localizadas dívidas (PEFIN/REFIN) no Relatório Intermediário PF.</p>
                </div>
              </CardContent>
            </Card>
          )}

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
                    {entrada > 0 && entrada < minEntrada - 0.01 && (
                      <p className="text-xs text-destructive">
                        Entrada insuficiente para essa faixa de score. Aumente o valor da entrada para prosseguir.
                      </p>
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

                    {parcelas && (
                      <div className="mt-6">
                        <div className="mb-2 flex items-center justify-between">
                          <h3 className="text-sm font-semibold">Tabela de amortização (Price)</h3>
                          <p className="text-xs text-muted-foreground">Taxa: {taxaScore}% a.m.</p>
                        </div>
                        <div className="rounded-lg border overflow-hidden">
                          <div className="max-h-80 overflow-auto">
                            <Table>
                              <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur">
                                <TableRow>
                                  <TableHead className="w-16">Mês</TableHead>
                                  <TableHead className="text-right">Parcela</TableHead>
                                  <TableHead className="text-right">Juros</TableHead>
                                  <TableHead className="text-right">Amortização</TableHead>
                                  <TableHead className="text-right">Saldo</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {amortizationSchedule(financiado, taxaScore, parcelas).map((r) => (
                                  <TableRow key={r.mes}>
                                    <TableCell className="font-medium">{r.mes}</TableCell>
                                    <TableCell className="text-right">{brl(r.parcela)}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{brl(r.juros)}</TableCell>
                                    <TableCell className="text-right">{brl(r.amortizacao)}</TableCell>
                                    <TableCell className="text-right font-semibold">{brl(r.saldo)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-6 flex gap-3 print:hidden">
                      <Button onClick={handleRegistrarAprovada} disabled={!parcelas || savingVenda}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white">
                        {savingVenda ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar venda aprovada"}
                      </Button>
                      <Button onClick={registrarRecusada} disabled={!parcelas || savingVenda}
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

      <SaleAddressDialog
        open={addressOpen}
        onOpenChange={setAddressOpen}
        onConfirm={confirmarVendaComEndereco}
        clienteNome={result?.nome}
      />
    </AppLayout>
  );
}
