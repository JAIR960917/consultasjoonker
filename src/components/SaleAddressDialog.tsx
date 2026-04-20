import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { maskPhone } from "@/lib/contract";

export interface AddressData {
  endereco: string;
  telefone: string;
  primeiroVencimento: string; // ISO yyyy-mm-dd
  cidade: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado quando o vendedor confirma os dados (após dialog de confirmação). */
  onConfirm: (data: AddressData) => void;
  clienteNome?: string;
  /** Cidade padrão (do usuário logado) — usada quando nenhuma seleção é exigida. */
  cidadePadrao?: string;
  /** Quando preenchido, exibe seletor de cidade (admin). */
  cidadesDisponiveis?: string[];
}

export function SaleAddressDialog({
  open, onOpenChange, onConfirm, clienteNome, cidadePadrao, cidadesDisponiveis,
}: Props) {
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [endereco, setEndereco] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState<string>(cidadePadrao || "");
  const defaultVenc = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();
  const [primeiroVencimento, setPrimeiroVencimento] = useState<string>(defaultVenc);

  const mostrarSeletorCidade = !!cidadesDisponiveis && cidadesDisponiveis.length > 0;

  const reset = () => {
    setStep("form");
    setEndereco("");
    setTelefone("");
    setCidade(cidadePadrao || "");
    setPrimeiroVencimento(defaultVenc);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const cidadeFinal = mostrarSeletorCidade ? cidade : (cidadePadrao || "");

  const podeAvancar =
    endereco.trim().length >= 8 &&
    telefone.replace(/\D/g, "").length >= 10 &&
    !!primeiroVencimento &&
    (!mostrarSeletorCidade || !!cidade);

  const vencFmt = primeiroVencimento
    ? new Date(primeiroVencimento + "T00:00:00").toLocaleDateString("pt-BR")
    : "";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>Dados para o contrato</DialogTitle>
              <DialogDescription>
                {clienteNome ? `Informe o endereço e telefone de ${clienteNome}.` : "Informe o endereço e o telefone do cliente."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {mostrarSeletorCidade && (
                <div className="space-y-2">
                  <Label htmlFor="cidade">Cidade da venda</Label>
                  <Select value={cidade} onValueChange={setCidade}>
                    <SelectTrigger id="cidade">
                      <SelectValue placeholder="Selecione a cidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {cidadesDisponiveis!.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Como administrador, escolha a cidade onde a venda está sendo realizada.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="endereco">Endereço completo</Label>
                <Textarea
                  id="endereco"
                  placeholder="Rua, número, bairro, cidade - UF, CEP"
                  rows={3}
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  placeholder="(11) 91234-5678"
                  value={telefone}
                  onChange={(e) => setTelefone(maskPhone(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="primeiro-venc">Vencimento da 1ª parcela</Label>
                <Input
                  id="primeiro-venc"
                  type="date"
                  value={primeiroVencimento}
                  onChange={(e) => setPrimeiroVencimento(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button disabled={!podeAvancar} onClick={() => setStep("confirm")}>
                Continuar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirmar dados</DialogTitle>
              <DialogDescription>
                Confira os dados antes de gerar o contrato. Eles serão preenchidos automaticamente.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
              {cidadeFinal && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Cidade da venda</p>
                  <p className="font-medium">{cidadeFinal}</p>
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Endereço</p>
                <p className="font-medium whitespace-pre-wrap">{endereco}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Telefone</p>
                <p className="font-medium">{telefone}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Vencimento da 1ª parcela</p>
                <p className="font-medium">{vencFmt}</p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("form")}>Voltar e editar</Button>
              <Button
                className="bg-success hover:bg-success/90 text-success-foreground"
                onClick={() => {
                  onConfirm({
                    endereco: endereco.trim(),
                    telefone,
                    primeiroVencimento,
                    cidade: cidadeFinal,
                  });
                  reset();
                }}
              >
                Confirmar e gerar contrato
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
