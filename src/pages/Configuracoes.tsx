import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

interface Settings {
  id: string;
  min_entry_percent: number;
  min_score: number;
  good_score: number;
  installment_rates: Record<string, number>;
  max_installments: number;
}

export default function Configuracoes() {
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [novaParcela, setNovaParcela] = useState("");
  const [novaTaxa, setNovaTaxa] = useState("");

  useEffect(() => {
    supabase.from("settings").select("*").limit(1).maybeSingle().then(({ data }) => {
      if (data) setS({
        ...data,
        installment_rates: (data.installment_rates as Record<string, number>) ?? {},
      } as Settings);
    });
  }, []);

  if (!s) return <AppLayout><Loader2 className="h-6 w-6 animate-spin" /></AppLayout>;

  const setField = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  const addRate = () => {
    const n = parseInt(novaParcela, 10);
    const t = parseFloat(novaTaxa.replace(",", "."));
    if (!n || n < 1 || isNaN(t) || t < 0) {
      toast.error("Parcela ou taxa inválida"); return;
    }
    setField("installment_rates", { ...s.installment_rates, [String(n)]: t });
    setNovaParcela(""); setNovaTaxa("");
  };

  const removeRate = (k: string) => {
    const next = { ...s.installment_rates };
    delete next[k];
    setField("installment_rates", next);
  };

  const updateRate = (k: string, v: string) => {
    const t = parseFloat(v.replace(",", "."));
    if (isNaN(t)) return;
    setField("installment_rates", { ...s.installment_rates, [k]: t });
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("settings").update({
      min_entry_percent: s.min_entry_percent,
      min_score: s.min_score,
      good_score: s.good_score,
      installment_rates: s.installment_rates,
      max_installments: s.max_installments,
    }).eq("id", s.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar", { description: error.message });
    else toast.success("Configurações salvas");
  };

  const sortedKeys = Object.keys(s.installment_rates).map((k) => parseInt(k)).sort((a, b) => a - b).map(String);

  return (
    <AppLayout>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Regras de aprovação e juros do sistema</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardContent className="p-6 space-y-4">
            <h2 className="text-lg font-semibold">Critérios de aprovação</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Score mínimo</Label>
                <Input type="number" value={s.min_score} onChange={(e) => setField("min_score", parseInt(e.target.value || "0"))} />
              </div>
              <div className="space-y-2">
                <Label>Score "bom"</Label>
                <Input type="number" value={s.good_score} onChange={(e) => setField("good_score", parseInt(e.target.value || "0"))} />
              </div>
              <div className="space-y-2">
                <Label>Entrada mín. (%)</Label>
                <Input type="number" step="0.01" value={s.min_entry_percent} onChange={(e) => setField("min_entry_percent", parseFloat(e.target.value || "0"))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Parcelas máximas</Label>
              <Input type="number" value={s.max_installments} onChange={(e) => setField("max_installments", parseInt(e.target.value || "0"))} />
            </div>
            <p className="text-xs text-muted-foreground">
              Score &lt; mínimo = recusado. Score &gt;= "bom" recebe a entrada mínima sugerida; entre os dois, a entrada sugerida cresce proporcionalmente.
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6 space-y-4">
            <h2 className="text-lg font-semibold">Taxas de juros (mensais)</h2>
            <div className="space-y-2">
              {sortedKeys.map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-12 text-sm font-medium">{k}x</span>
                  <Input type="number" step="0.01" value={s.installment_rates[k]}
                    onChange={(e) => updateRate(k, e.target.value)} />
                  <span className="text-xs text-muted-foreground">% a.m.</span>
                  <Button variant="ghost" size="icon" onClick={() => removeRate(k)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="border-t pt-4">
              <Label className="text-xs">Adicionar nova faixa</Label>
              <div className="mt-2 flex gap-2">
                <Input placeholder="Parcelas" value={novaParcela} onChange={(e) => setNovaParcela(e.target.value)} />
                <Input placeholder="Taxa %" value={novaTaxa} onChange={(e) => setNovaTaxa(e.target.value)} />
                <Button onClick={addRate} variant="outline"><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={save} disabled={saving} size="lg" className="bg-gradient-primary">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar configurações"}
        </Button>
      </div>
    </AppLayout>
  );
}
