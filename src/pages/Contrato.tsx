import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, PenLine, FileDown, ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { maskCpf, brl } from "@/lib/finance";
import { downloadContractPdf } from "@/lib/pdf";
import { SignatureMockDialog } from "@/components/SignatureMockDialog";
import { ParcelasContrato } from "@/components/ParcelasContrato";

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
  signature_provider: string | null;
  signature_data: { signed_pdf_url?: string } | null;
  created_at: string;
  venda_id: string | null;
}

interface VendaInfo {
  valor_total: number;
  primeiro_vencimento: string | null;
}

interface TemplateRow {
  title: string;
  company_name: string;
  company_cnpj: string;
  company_address: string;
}

export default function Contrato() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [c, setC] = useState<ContractRow | null>(null);
  const [tpl, setTpl] = useState<TemplateRow | null>(null);
  const [venda, setVenda] = useState<VendaInfo | null>(null);
  const [signing, setSigning] = useState(false);
  const [signDialog, setSignDialog] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: contract }, { data: template }] = await Promise.all([
        supabase.from("contracts").select("*").eq("id", id).maybeSingle(),
        supabase.from("contract_template").select("title, company_name, company_cnpj, company_address").limit(1).maybeSingle(),
      ]);
      if (contract) {
        setC(contract as ContractRow);
        if ((contract as ContractRow).venda_id) {
          const { data: vendaRow } = await supabase
            .from("vendas")
            .select("valor_total")
            .eq("id", (contract as ContractRow).venda_id!)
            .maybeSingle();
          // Tenta pegar a primeira parcela já criada; se não existir, fica null
          const { data: parcela1 } = await supabase
            .from("parcelas")
            .select("vencimento")
            .eq("venda_id", (contract as ContractRow).venda_id!)
            .order("numero_parcela", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (vendaRow) {
            setVenda({
              valor_total: Number(vendaRow.valor_total),
              primeiro_vencimento: parcela1?.vencimento ?? null,
            });
          }
        }
      }
      if (template) setTpl(template as TemplateRow);
    })();
  }, [id]);

  const handleStartSignature = async () => {
    if (!c) return;
    setSigning(true);
    // Mock: gera uma URL placeholder. Quando a Assertiva for integrada, o backend
    // substituirá por: signature_url retornada por GET /v1/signatarios/{id}/obter-link
    const mockUrl =
      c.signature_url ||
      `https://assinaturas.assertivasolucoes.com.br/mock/${c.id}`;

    const { error } = await supabase
      .from("contracts")
      .update({
        status: "aguardando_assinatura",
        signature_provider: "assertiva_mock",
        signature_url: mockUrl,
      })
      .eq("id", c.id);
    setSigning(false);
    if (error) {
      toast.error("Erro ao iniciar assinatura", { description: error.message });
      return;
    }
    setC({ ...c, status: "aguardando_assinatura", signature_url: mockUrl });
    setSignDialog(true);
  };

  const handleSimulateSign = async () => {
    if (!c) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("contracts")
      .update({ status: "assinado", signed_at: now })
      .eq("id", c.id);
    if (error) {
      toast.error("Erro ao concluir simulação", { description: error.message });
      return;
    }
    setC({ ...c, status: "assinado", signed_at: now });
    toast.success("Assinatura simulada com sucesso", {
      description: "Quando a Assertiva for conectada, isto acontecerá automaticamente.",
    });
  };

  const handleDownloadPdf = () => {
    if (!c || !tpl) return;
    downloadContractPdf(
      {
        title: tpl.title,
        companyName: tpl.company_name,
        companyCnpj: tpl.company_cnpj,
        companyAddress: tpl.company_address,
        clientName: c.nome,
        clientCpf: maskCpf(c.cpf),
        content: c.content,
        signedAt: c.signed_at ? new Date(c.signed_at).toLocaleString("pt-BR") : null,
      },
      `contrato-${c.nome.replace(/\s+/g, "_")}.pdf`,
    );
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleDownloadPdf}>
            <FileDown className="mr-2 h-4 w-4" /> Baixar cópia
          </Button>

          {assinado && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      onClick={() => {
                        const url = c.signature_data?.signed_pdf_url;
                        if (url) window.open(url, "_blank");
                      }}
                      disabled={!c.signature_data?.signed_pdf_url}
                      className="bg-success text-success-foreground hover:bg-success/90"
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" /> Baixar contrato assinado
                    </Button>
                  </span>
                </TooltipTrigger>
                {!c.signature_data?.signed_pdf_url && (
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      O PDF oficial com certificado e trilha de auditoria estará disponível
                      assim que a integração com a Assertiva Assinaturas for ativada.
                    </p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}

          {assinado ? (
            <Button onClick={() => setSignDialog(true)} variant="outline" className="border-success text-success hover:bg-success/10">
              <CheckCircle2 className="mr-2 h-4 w-4" /> Assinado
            </Button>
          ) : enviado ? (
            <Button onClick={() => setSignDialog(true)} className="bg-warning text-warning-foreground hover:bg-warning/90" size="lg">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Aguardando assinatura
            </Button>
          ) : (
            <Button
              onClick={handleStartSignature}
              disabled={signing}
              className="bg-gradient-primary"
              size="lg"
            >
              {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><PenLine className="mr-2 h-4 w-4" /> Assinar contrato</>}
            </Button>
          )}
        </div>
      </header>

      <Card className="shadow-elegant overflow-hidden">
        <div className={`h-1 ${assinado ? "bg-success" : enviado ? "bg-warning" : "bg-primary"}`} />
        <CardContent className="p-8 sm:p-12">
          <div className="mx-auto max-w-3xl text-white">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div className="flex-1 text-center">
                <h2 className="text-2xl font-bold text-white">{tpl.title.toUpperCase()}</h2>
                <p className="mt-1 text-white">{tpl.company_name}</p>
              </div>
              {venda && (
                <div className="text-right text-xs shrink-0 border-l border-border pl-4 !text-white">
                  {venda.primeiro_vencimento && (
                    <p className="!text-white">
                      <span className="!text-white">Vencimento: </span>
                      <span className="font-semibold !text-white">
                        {new Date(venda.primeiro_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                      </span>
                    </p>
                  )}
                  <p className="mt-1 !text-white">
                    <span className="!text-white">Valor total: </span>
                    <span className="font-semibold !text-white">{brl(venda.valor_total)}</span>
                  </p>
                </div>
              )}
            </div>

            <article className="whitespace-pre-wrap text-sm leading-7 text-white">
              {c.content}
            </article>

            <div className="mt-12 flex justify-center">
              <div className="w-full max-w-sm">
                <div className="border-t border-white pt-2 text-center text-sm">
                  <p className="font-semibold text-white">{c.nome}</p>
                  <p className="text-white">CPF: {maskCpf(c.cpf)}</p>
                </div>
                {assinado && (
                  <p className="mt-2 text-center text-xs text-success font-medium">
                    ✓ Assinado em {c.signed_at ? new Date(c.signed_at).toLocaleString("pt-BR") : ""}
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <ParcelasContrato contratoId={c.id} contratoAssinado={assinado} />

      <SignatureMockDialog
        open={signDialog}
        onOpenChange={setSignDialog}
        signatureUrl={c.signature_url || ""}
        status={assinado ? "assinado" : "aguardando_assinatura"}
        onSimulateSign={!assinado ? handleSimulateSign : undefined}
      />
    </AppLayout>
  );
}
