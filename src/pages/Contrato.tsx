import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, PenLine, FileDown, ArrowLeft, CheckCircle2, ShieldCheck, Trash2, RefreshCw } from "lucide-react";
import { maskCpf, brl } from "@/lib/finance";
import { downloadContractPdf } from "@/lib/pdf";
import { SignatureMockDialog } from "@/components/SignatureMockDialog";
import { ParcelasContrato } from "@/components/ParcelasContrato";
import { useAuth } from "@/contexts/AuthContext";

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
  empresa_id: string | null;
}

interface VendaInfo {
  valor_total: number;
  primeiro_vencimento: string | null;
  parcelas: number;
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
  const { role } = useAuth();
  const [c, setC] = useState<ContractRow | null>(null);
  const [tpl, setTpl] = useState<TemplateRow | null>(null);
  const [venda, setVenda] = useState<VendaInfo | null>(null);
  const [signing, setSigning] = useState(false);
  const [signDialog, setSignDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [downloadingSigned, setDownloadingSigned] = useState(false);
  const [phoneChoiceOpen, setPhoneChoiceOpen] = useState(false);
  const [phoneChoice, setPhoneChoice] = useState<"cliente" | "empresa">("cliente");
  const [empresaTelefone, setEmpresaTelefone] = useState<string | null>(null);

  const handleDownloadSigned = async () => {
    if (!c) return;
    setDownloadingSigned(true);
    try {
      const { data, error } = await supabase.functions.invoke("assertiva-baixar-assinado", {
        body: { contrato_id: c.id },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error("Documento ainda não disponível", {
          description: data?.error ?? "A Assertiva ainda não disponibilizou o PDF assinado.",
        });
        return;
      }
      if (data.pdf_base64) {
        const bin = atob(data.pdf_base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.filename ?? "contrato-assinado.pdf";
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Contrato assinado baixado");
      } else if (data.pdf_url) {
        window.open(data.pdf_url, "_blank");
      }
    } catch (e: any) {
      toast.error("Erro ao baixar contrato assinado", { description: e?.message });
    } finally {
      setDownloadingSigned(false);
    }
  };

  const handleDelete = async () => {
    if (!c) return;
    setDeleting(true);

    // Bloqueia exclusão se já existe boleto emitido (cora_invoice_id) para este contrato
    const { data: emitidas, error: checkError } = await supabase
      .from("parcelas")
      .select("id, numero_parcela, cora_invoice_id, status")
      .eq("contrato_id", c.id)
      .not("cora_invoice_id", "is", null);

    if (checkError) {
      setDeleting(false);
      toast.error("Erro ao verificar boletos", { description: checkError.message });
      return;
    }

    if (emitidas && emitidas.length > 0) {
      setDeleting(false);
      setDeleteDialog(false);
      toast.error("Não é possível excluir este contrato", {
        description: `Existem ${emitidas.length} boleto(s) emitido(s) no nome do cliente. Cancele os boletos no Cora antes de excluir.`,
      });
      return;
    }

    await supabase.from("parcelas").delete().eq("contrato_id", c.id);
    const { error } = await supabase.from("contracts").delete().eq("id", c.id);
    setDeleting(false);
    if (error) {
      toast.error("Erro ao excluir contrato", { description: error.message });
      return;
    }
    toast.success("Contrato excluído");
    nav("/contratos");
  };

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
            .select("valor_total, primeiro_vencimento, parcelas")
            .eq("id", (contract as ContractRow).venda_id!)
            .maybeSingle();
          const { data: parcela1 } = await supabase
            .from("parcelas")
            .select("vencimento")
            .eq("venda_id", (contract as ContractRow).venda_id!)
            .order("numero_parcela", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (vendaRow) {
            let venc: string | null =
              (vendaRow as { primeiro_vencimento: string | null }).primeiro_vencimento ??
              parcela1?.vencimento ??
              null;
            if (!venc) {
              const match = (contract as ContractRow).content.match(
                /vencimento[^0-9]{0,40}(\d{2}\/\d{2}\/\d{4})/i,
              );
              if (match) {
                const [d, m, y] = match[1].split("/");
                venc = `${y}-${m}-${d}`;
              }
            }
            setVenda({
              valor_total: Number(vendaRow.valor_total),
              primeiro_vencimento: venc,
              parcelas: Number((vendaRow as { parcelas: number }).parcelas) || 1,
            });
          }
        }

        // Carrega telefone da empresa para opção de envio do link de assinatura
        const empresaIdResolve = (contract as ContractRow).empresa_id;
        if (empresaIdResolve) {
          const { data: emp } = await supabase
            .from("empresas")
            .select("telefone")
            .eq("id", empresaIdResolve)
            .maybeSingle();
          setEmpresaTelefone(emp?.telefone ?? null);
        } else if ((contract as ContractRow).venda_id) {
          const { data: vendaEmp } = await supabase
            .from("vendas")
            .select("empresa_id, empresas(telefone)")
            .eq("id", (contract as ContractRow).venda_id!)
            .maybeSingle();
          // @ts-expect-error - relação aninhada
          setEmpresaTelefone(vendaEmp?.empresas?.telefone ?? null);
        }
      }
      if (template) setTpl(template as TemplateRow);
    })();
  }, [id]);

  const handleStartSignature = () => {
    if (!c) return;
    // Abre o diálogo para o vendedor escolher o destinatário do link
    setPhoneChoice(empresaTelefone ? "empresa" : "cliente");
    setPhoneChoiceOpen(true);
  };

  const submitSignature = async () => {
    if (!c) return;
    if (phoneChoice === "empresa" && !empresaTelefone) {
      toast.error("A empresa não tem telefone cadastrado", {
        description: "Cadastre o telefone na página Empresas ou envie para o cliente.",
      });
      return;
    }
    const telefoneEnvio = phoneChoice === "empresa" ? empresaTelefone! : c.telefone;
    setPhoneChoiceOpen(false);
    setSigning(true);

    const { data, error } = await supabase.functions.invoke("assertiva-enviar-assinatura", {
      body: { contrato_id: c.id, telefone_envio: telefoneEnvio },
    });

    setSigning(false);

    if (error || !data?.ok) {
      const msg = data?.error || error?.message || "Erro desconhecido";
      toast.error("Falha ao enviar para assinatura", { description: msg });
      return;
    }

    const newUrl = data.signature_url || c.signature_url || "";
    setC({
      ...c,
      status: "aguardando_assinatura",
      signature_url: newUrl,
      signature_provider: "assertiva",
    });
    toast.success("Contrato enviado", {
      description: phoneChoice === "empresa"
        ? "O link foi enviado para o WhatsApp da loja."
        : "O cliente receberá o link de assinatura via WhatsApp.",
    });
    setSignDialog(true);
  };

  const handleSyncStatus = async () => {
    if (!c) return;
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("assertiva-sincronizar-status", {
      body: { contrato_id: c.id },
    });
    setSyncing(false);
    if (error || !data?.ok) {
      const msg = data?.error || error?.message || "Erro desconhecido";
      toast.error("Falha ao sincronizar", { description: msg });
      return;
    }
    if (data.status === "assinado") {
      setC({ ...c, status: "assinado", signed_at: new Date().toISOString() });
      toast.success("Contrato assinado!", { description: "Status atualizado a partir da Assertiva." });
    } else {
      toast.info("Ainda não assinado", {
        description: `Status na Assertiva: ${data.statusPedido || data.statusParte || "pendente"}`,
      });
    }
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
        vencimento: venda?.primeiro_vencimento
          ? new Date(venda.primeiro_vencimento + "T00:00:00").toLocaleDateString("pt-BR")
          : null,
        valorTotal: venda ? brl(venda.valor_total) : null,
        numero: "Nº 1 DE 1",
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

          {role === "admin" && (
            <Button
              variant="outline"
              onClick={() => setDeleteDialog(true)}
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Excluir
            </Button>
          )}

          {assinado && (
            <Button
              onClick={handleDownloadSigned}
              disabled={downloadingSigned}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              {downloadingSigned ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              Baixar contrato assinado
            </Button>
          )}

          {assinado ? (
            <Button onClick={() => setSignDialog(true)} variant="outline" className="border-success text-success hover:bg-success/10">
              <CheckCircle2 className="mr-2 h-4 w-4" /> Assinado
            </Button>
          ) : enviado ? (
            <>
              <Button onClick={() => setSignDialog(true)} className="bg-warning text-warning-foreground hover:bg-warning/90" size="lg">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Aguardando assinatura
              </Button>
              <Button onClick={handleSyncStatus} disabled={syncing} variant="outline" size="lg">
                {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sincronizar status
              </Button>
            </>
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
          <div className="mx-auto max-w-3xl text-card-foreground">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div className="flex-1 text-center">
                <div className="flex items-baseline justify-center gap-2">
                  <h2 className="text-2xl font-bold">{tpl.title.toUpperCase()}</h2>
                  <span className="text-xs">Nº 1 DE 1</span>
                </div>
              </div>
              {venda && (
                <div className="text-right text-xs shrink-0 border-l border-border pl-4">
                  {venda.primeiro_vencimento && (
                    <p>
                      <span>Vencimento: </span>
                      <span className="font-semibold">
                        {new Date(venda.primeiro_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                      </span>
                    </p>
                  )}
                  <p className="mt-1">
                    <span>Valor: </span>
                    <span className="font-semibold">{brl(venda.valor_total)}</span>
                  </p>
                </div>
              )}
            </div>

            <article className="text-sm leading-7 break-words">
              {c.content.split("\n").map((line, i) => {
                // Detecta "colunas" criadas com 4+ espaços consecutivos no template
                // (ex.: "Emitente: NOME            CIDADE, DATA") e renderiza
                // como flex para evitar quebras feias em telas estreitas.
                const m = line.match(/^(.*?\S)\s{4,}(\S.*)$/);
                if (m) {
                  return (
                    <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                      <span>{m[1]}</span>
                      <span className="text-right">{m[2]}</span>
                    </div>
                  );
                }
                if (line.trim() === "") return <div key={i} className="h-3" />;
                return <p key={i}>{line}</p>;
              })}
            </article>

            <div className="mt-12 flex justify-center">
              <div className="w-full max-w-sm">
                <div className="border-t border-card-foreground pt-2 text-center text-sm">
                  <p className="font-semibold">Assinatura do emitente</p>
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

      <AlertDialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. O contrato e todas as parcelas relacionadas serão removidos.
              Boletos já emitidos no Cora não serão cancelados automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
