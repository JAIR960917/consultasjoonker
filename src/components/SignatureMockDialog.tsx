import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { Copy, CheckCircle2, Loader2, Smartphone, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  signatureUrl: string;
  status: "aguardando_assinatura" | "assinado";
  onSimulateSign?: () => void; // remove quando integrar Assertiva
}

export function SignatureMockDialog({ open, onOpenChange, signatureUrl, status, onSimulateSign }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const copy = async () => {
    await navigator.clipboard.writeText(signatureUrl);
    setCopied(true);
    toast.success("Link copiado");
    setTimeout(() => setCopied(false), 2000);
  };

  const assinado = status === "assinado";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {assinado ? (
              <><CheckCircle2 className="h-5 w-5 text-success" /> Contrato assinado</>
            ) : (
              <><Smartphone className="h-5 w-5 text-primary" /> Assinatura do cliente</>
            )}
          </DialogTitle>
          <DialogDescription>
            {assinado
              ? "O cliente concluiu a assinatura. O contrato já tem validade jurídica."
              : "Peça para o cliente escanear o QR Code com o celular para assinar com selfie + documento."}
          </DialogDescription>
        </DialogHeader>

        {!assinado ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center rounded-lg border bg-white p-6">
              <QRCodeSVG value={signatureUrl} size={220} level="M" includeMargin />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={copy}>
                {copied ? <CheckCircle2 className="mr-2 h-4 w-4 text-success" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? "Copiado" : "Copiar link"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => window.open(signatureUrl, "_blank")}>
                <ExternalLink className="mr-2 h-4 w-4" /> Abrir
              </Button>
            </div>

            <div className="rounded-md border border-dashed border-warning/50 bg-warning/5 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-warning-foreground mb-1">⚠ Modo simulação</p>
              <p>
                A integração com a Assertiva Assinaturas será conectada quando as credenciais
                estiverem disponíveis. Por enquanto, use o botão abaixo para simular a conclusão da assinatura
                e validar o fluxo completo.
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Aguardando assinatura...
            </div>

            {onSimulateSign && (
              <Button variant="secondary" className="w-full" onClick={onSimulateSign}>
                Simular assinatura concluída
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="rounded-full bg-success/10 p-4">
              <CheckCircle2 className="h-12 w-12 text-success" />
            </div>
            <p className="text-sm text-center text-muted-foreground">
              Você pode baixar o PDF assinado e arquivar.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
