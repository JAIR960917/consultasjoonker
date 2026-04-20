import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Eye, Pencil } from "lucide-react";
import { AVAILABLE_VARS, fillTemplate } from "@/lib/contract";

interface TemplateRow {
  id: string;
  title: string;
  company_name: string;
  company_cnpj: string;
  company_address: string;
  content: string;
}

const SAMPLE = {
  nome: "João da Silva",
  cpf: "123.456.789-00",
  endereco: "Rua Exemplo, 123, Centro, Cidade - UF, 00000-000",
  telefone: "(11) 91234-5678",
  empresa: "Sua Empresa",
  empresa_cnpj: "00.000.000/0001-00",
  empresa_endereco: "Rua Exemplo da Sede, 100, Centro, Cidade - UF, 00000-000",
  valor_total: "1.800,00",
  valor_entrada: "450,00",
  valor_financiado: "1.350,00",
  valor_parcela: "150,00",
  parcelas: 10,
  taxa_juros: "3,00",
  data: new Date().toLocaleDateString("pt-BR"),
};

export function ContractTemplateTab() {
  const [tpl, setTpl] = useState<TemplateRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    supabase.from("contract_template").select("*").limit(1).maybeSingle().then(({ data }) => {
      if (data) setTpl(data as TemplateRow);
    });
  }, []);

  if (!tpl) return <Loader2 className="h-6 w-6 animate-spin" />;

  const set = (patch: Partial<TemplateRow>) => setTpl({ ...tpl, ...patch });

  const insertVar = (key: string) => {
    const token = `{{${key}}}`;
    set({ content: `${tpl.content}${tpl.content.endsWith("\n") || tpl.content === "" ? "" : " "}${token}` });
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("contract_template").update({
      title: tpl.title,
      company_name: tpl.company_name,
      content: tpl.content,
    }).eq("id", tpl.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar", { description: error.message });
    else toast.success("Modelo de contrato salvo");
  };

  const preview = fillTemplate(tpl.content, { ...SAMPLE, empresa: tpl.company_name });

  return (
    <div className="grid gap-6">
      <Card className="shadow-card">
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Identificação</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Título do contrato</Label>
              <Input value={tpl.title} onChange={(e) => set({ title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Nome da empresa (CONTRATADO)</Label>
              <Input value={tpl.company_name} onChange={(e) => set({ company_name: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Conteúdo do contrato</h2>
              <p className="text-sm text-muted-foreground">
                Use as variáveis abaixo para que o sistema preencha automaticamente com os dados do cliente.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={mode === "edit" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("edit")}
              >
                <Pencil className="mr-1 h-4 w-4" />Editar
              </Button>
              <Button
                variant={mode === "preview" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("preview")}
              >
                <Eye className="mr-1 h-4 w-4" />Pré-visualizar
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {AVAILABLE_VARS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => insertVar(v.key)}
                className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                title={`Inserir {{${v.key}}}`}
              >
                {v.label} <span className="font-mono text-muted-foreground">{`{{${v.key}}}`}</span>
              </button>
            ))}
          </div>

          {mode === "edit" ? (
            <Textarea
              value={tpl.content}
              onChange={(e) => set({ content: e.target.value })}
              rows={20}
              className="font-mono text-sm"
              placeholder="Escreva aqui o texto do contrato..."
            />
          ) : (
            <div className="rounded-lg border bg-card p-6 whitespace-pre-wrap text-sm leading-relaxed max-h-[500px] overflow-auto">
              <h3 className="text-lg font-bold text-center mb-2">{tpl.title}</h3>
              <p className="text-center text-muted-foreground mb-6">{tpl.company_name}</p>
              {preview}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} size="lg" className="bg-gradient-primary">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar modelo"}
        </Button>
      </div>
    </div>
  );
}
