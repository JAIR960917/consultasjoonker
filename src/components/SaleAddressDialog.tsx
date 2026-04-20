import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { maskPhone } from "@/lib/contract";

export interface AddressData {
  endereco: string;
  telefone: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado quando o vendedor confirma os dados (após dialog de confirmação). */
  onConfirm: (data: AddressData) => void;
  clienteNome?: string;
}

/**
 * Fluxo em dois passos: 1) coleta endereço/telefone, 2) confirmação.
 */
export function SaleAddressDialog({ open, onOpenChange, onConfirm, clienteNome }: Props) {
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [endereco, setEndereco] = useState("");
  const [telefone, setTelefone] = useState("");

  const reset = () => {
    setStep("form");
    setEndereco("");
    setTelefone("");
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const podeAvancar = endereco.trim().length >= 8 && telefone.replace(/\D/g, "").length >= 10;

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
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Endereço</p>
                <p className="font-medium whitespace-pre-wrap">{endereco}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Telefone</p>
                <p className="font-medium">{telefone}</p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("form")}>Voltar e editar</Button>
              <Button
                className="bg-success hover:bg-success/90 text-success-foreground"
                onClick={() => {
                  onConfirm({ endereco: endereco.trim(), telefone });
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
