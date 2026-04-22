import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { Copy, CheckCircle2, Loader2, Smartphone, ExternalLink, MessageCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  signatureUrl: string;
  status: "aguardando_assinatura" | "assinado";
  onSimulateSign?: () => void;
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
  const hasUrl = !!signatureUrl;

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
              : "O link de assinatura foi enviado para o WhatsApp do cliente. Você também pode compartilhar por aqui."}
          </DialogDescription>
        </DialogHeader>

        {!assinado ? (
          <div className="space-y-4">
            <div className="rounded-md border border-success/40 bg-success/5 p-3 text-sm flex items-start gap-2">
              <MessageCircle className="h-4 w-4 mt-0.5 text-success shrink-0" />
              <div>
                <p className="font-medium text-foreground">Enviado via WhatsApp</p>
                <p className="text-xs text-muted-foreground">
                  Quando o cliente assinar, o status atualiza automaticamente nesta página.
                </p>
              </div>
            </div>

            {hasUrl && (
              <>
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
              </>
            )}

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Aguardando assinatura...
            </div>

            {onSimulateSign && (
              <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={onSimulateSign}>
                Marcar como assinado manualmente (admin)
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
