import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, PenLine, Printer, ArrowLeft, CheckCircle2 } from "lucide-react";
import { maskCpf } from "@/lib/finance";

interface ContractRow {
  id: string;
  cpf: string;
  nome: string;
  endereco: string;
  telefone: string;
  content: string;
  status: string;
  signed_at: string | null;
  signature_url: string | null;
  created_at: string;
}

interface TemplateRow {
  title: string;
  company_name: string;
}

export default function Contrato() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [c, setC] = useState<ContractRow | null>(null);
  const [tpl, setTpl] = useState<TemplateRow | null>(null);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: contract }, { data: template }] = await Promise.all([
        supabase.from("contracts").select("*").eq("id", id).maybeSingle(),
        supabase.from("contract_template").select("title, company_name").limit(1).maybeSingle(),
      ]);
      if (contract) setC(contract as ContractRow);
      if (template) setTpl(template as TemplateRow);
    })();
  }, [id]);

  const handleSign = async () => {
    if (!c) return;
    setSigning(true);
    // TODO: integração com a API de assinatura (a ser informada pelo cliente).
    // Quando disponível, esta função invocará uma edge function que chama a API
    // do provedor escolhido (ZapSign / D4Sign / Clicksign / etc.) e atualiza o
    // contrato com signature_provider, signature_external_id, signature_url.
    //
    // Por ora, marcamos como "enviado para assinatura" para o vendedor saber
    // que o fluxo está pronto e funcional.
    const { error } = await supabase.from("contracts").update({
      status: "aguardando_assinatura",
    }).eq("id", c.id);
    setSigning(false);
    if (error) {
      toast.error("Erro ao iniciar assinatura", { description: error.message });
      return;
    }
    toast.success("Contrato pronto para assinatura", {
      description: "A integração com o provedor de assinatura será conectada em seguida.",
    });
    setC({ ...c, status: "aguardando_assinatura" });
  };

  if (!c || !tpl) {
    return (
      <AppLayout>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando contrato...
        </div>
      </AppLayout>
    );
  }

  const assinado = c.status === "assinado";
  const enviado = c.status === "aguardando_assinatura";

  return (
    <AppLayout>
      <header className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => nav(-1)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Contrato</h1>
          <p className="text-muted-foreground">{c.nome} · CPF {maskCpf(c.cpf)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Imprimir / PDF
          </Button>
          {!assinado && (
            <Button
              onClick={handleSign}
              disabled={signing || enviado}
              className="bg-gradient-primary"
              size="lg"
            >
              {signing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : enviado ? (
                <><CheckCircle2 className="mr-2 h-4 w-4" /> Aguardando assinatura</>
              ) : (
                <><PenLine className="mr-2 h-4 w-4" /> Assinar contrato</>
              )}
            </Button>
          )}
        </div>
      </header>

      <Card className="shadow-elegant overflow-hidden">
        <div className={`h-1 ${assinado ? "bg-success" : enviado ? "bg-warning" : "bg-primary"}`} />
        <CardContent className="p-8 sm:p-12">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold text-center">{tpl.title.toUpperCase()}</h2>
            <p className="text-center text-muted-foreground mt-1 mb-8">{tpl.company_name}</p>

            <article className="whitespace-pre-wrap text-sm leading-7 text-foreground">
              {c.content}
            </article>

            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-8 print:gap-12">
              <div>
                <div className="border-t border-foreground pt-2 text-center text-sm">
                  <p className="font-semibold">{c.nome}</p>
                  <p className="text-muted-foreground">CPF: {maskCpf(c.cpf)}</p>
                  <p className="text-xs text-muted-foreground mt-1">CONTRATANTE</p>
                </div>
                {assinado && (
                  <p className="mt-2 text-center text-xs text-success font-medium">
                    ✓ Assinado em {c.signed_at ? new Date(c.signed_at).toLocaleString("pt-BR") : ""}
                  </p>
                )}
              </div>
              <div>
                <div className="border-t border-foreground pt-2 text-center text-sm">
                  <p className="font-semibold">{tpl.company_name}</p>
                  <p className="text-xs text-muted-foreground mt-1">CONTRATADO</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
