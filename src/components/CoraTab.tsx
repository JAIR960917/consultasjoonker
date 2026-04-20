import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Zap, FileText, Copy, ExternalLink, Webhook, RefreshCw } from "lucide-react";

interface AuthResult {
  ok: boolean;
  message?: string;
  error?: string;
  status?: number;
  elapsed_ms?: number;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  access_token_preview?: string;
}

interface BoletoResult {
  ok: boolean;
  message?: string;
  error?: string;
  elapsed_ms?: number;
  invoice_id?: string | null;
  code?: string | null;
  status?: string | null;
  total_amount?: number;
  due_date?: string;
  pdf_url?: string | null;
  digitable_line?: string | null;
  barcode?: string | null;
  pix_emv?: string | null;
  pix_qrcode?: string | null;
}

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
};

export function CoraTab() {
  // Auth test
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [authResult, setAuthResult] = useState<AuthResult | null>(null);

  // Boleto teste
  const [form, setForm] = useState({
    nome: "",
    cpf: "",
    email: "",
    valor: "5.00",
    vencimento: tomorrow(),
    descricao: "Boleto de teste",
  });
  const [loadingBoleto, setLoadingBoleto] = useState(false);
  const [boletoResult, setBoletoResult] = useState<BoletoResult | null>(null);

  const setField = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const testarAuth = async () => {
    setLoadingAuth(true);
    setAuthResult(null);
    try {
      const { data, error } = await supabase.functions.invoke<AuthResult>("cora-auth-test", { body: {} });
      if (error) {
        setAuthResult({ ok: false, error: error.message });
        toast.error("Falha", { description: error.message });
      } else {
        setAuthResult(data ?? { ok: false, error: "Sem resposta" });
        if (data?.ok) toast.success("Autenticação Cora OK");
        else toast.error("Falhou", { description: data?.error });
      }
    } finally {
      setLoadingAuth(false);
    }
  };

  const emitirBoleto = async () => {
    setLoadingBoleto(true);
    setBoletoResult(null);
    try {
      const { data, error } = await supabase.functions.invoke<BoletoResult>("cora-emitir-boleto-teste", {
        body: {
          nome: form.nome,
          cpf: form.cpf,
          email: form.email || undefined,
          valor: Number(form.valor),
          vencimento: form.vencimento,
          descricao: form.descricao,
        },
      });
      if (error) {
        setBoletoResult({ ok: false, error: error.message });
        toast.error("Falha ao emitir boleto", { description: error.message });
      } else {
        setBoletoResult(data ?? { ok: false, error: "Sem resposta" });
        if (data?.ok) toast.success("Boleto emitido!");
        else toast.error("Erro Cora", { description: data?.error });
      }
    } finally {
      setLoadingBoleto(false);
    }
  };

  const copy = (text?: string | null) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success("Copiado");
  };

  return (
    <div className="grid gap-6">
      <Card className="shadow-card">
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Integração Cora — Boletos</h2>
            <p className="text-sm text-muted-foreground">
              Ambiente: <Badge variant="outline">Produção</Badge> · Endpoint:{" "}
              <code className="text-xs">matls-clients.api.cora.com.br</code>
            </p>
          </div>

          <Tabs defaultValue="boleto" className="w-full">
            <TabsList>
              <TabsTrigger value="auth">Autenticação</TabsTrigger>
              <TabsTrigger value="boleto">Emitir boleto teste</TabsTrigger>
              <TabsTrigger value="webhook">Webhook</TabsTrigger>
            </TabsList>

            {/* AUTH */}
            <TabsContent value="auth" className="space-y-4 pt-4">
              <Button onClick={testarAuth} disabled={loadingAuth} size="lg">
                {loadingAuth ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Autenticando...</>
                ) : (
                  <><Zap className="mr-2 h-4 w-4" />Testar autenticação</>
                )}
              </Button>

              {authResult && (
                <div className={`rounded-lg border p-4 ${authResult.ok ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}>
                  <div className="flex items-center gap-2 font-semibold mb-2">
                    {authResult.ok
                      ? <><CheckCircle2 className="h-5 w-5 text-success" /><span>Sucesso</span></>
                      : <><XCircle className="h-5 w-5 text-destructive" /><span>Falha</span></>}
                  </div>
                  {authResult.ok ? (
                    <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-sm">
                      <dt className="text-muted-foreground">Token type</dt><dd>{authResult.token_type ?? "—"}</dd>
                      <dt className="text-muted-foreground">Expira em</dt><dd>{authResult.expires_in ? `${authResult.expires_in}s` : "—"}</dd>
                      <dt className="text-muted-foreground">Latência</dt><dd>{authResult.elapsed_ms} ms</dd>
                    </dl>
                  ) : (
                    <p className="text-sm break-words"><span className="text-muted-foreground">Erro:</span> {authResult.error}</p>
                  )}
                </div>
              )}
            </TabsContent>

            {/* BOLETO */}
            <TabsContent value="boleto" className="space-y-4 pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome do pagador *</Label>
                  <Input value={form.nome} onChange={(e) => setField("nome", e.target.value)} placeholder="João da Silva" />
                </div>
                <div className="space-y-2">
                  <Label>CPF *</Label>
                  <Input value={form.cpf} onChange={(e) => setField("cpf", e.target.value)} placeholder="000.000.000-00" />
                </div>
                <div className="space-y-2">
                  <Label>E-mail (opcional)</Label>
                  <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="cliente@email.com" />
                </div>
                <div className="space-y-2">
                  <Label>Valor (R$) *</Label>
                  <Input type="number" step="0.01" min="5" value={form.valor} onChange={(e) => setField("valor", e.target.value)} />
                  <p className="text-xs text-muted-foreground">Mínimo R$ 5,00 (regra Cora)</p>
                </div>
                <div className="space-y-2">
                  <Label>Vencimento *</Label>
                  <Input type="date" value={form.vencimento} onChange={(e) => setField("vencimento", e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Descrição</Label>
                  <Textarea rows={2} value={form.descricao} onChange={(e) => setField("descricao", e.target.value)} />
                </div>
              </div>

              <Button onClick={emitirBoleto} disabled={loadingBoleto} size="lg">
                {loadingBoleto ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Emitindo...</>
                ) : (
                  <><FileText className="mr-2 h-4 w-4" />Emitir boleto de teste</>
                )}
              </Button>

              {boletoResult && (
                <div className={`rounded-lg border p-4 ${boletoResult.ok ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}>
                  <div className="flex items-center gap-2 font-semibold mb-3">
                    {boletoResult.ok
                      ? <><CheckCircle2 className="h-5 w-5 text-success" /><span>Boleto emitido</span></>
                      : <><XCircle className="h-5 w-5 text-destructive" /><span>Falha ao emitir</span></>}
                  </div>

                  {boletoResult.ok ? (
                    <div className="space-y-3 text-sm">
                      <dl className="grid grid-cols-[140px_1fr] gap-y-1">
                        <dt className="text-muted-foreground">Invoice ID</dt><dd className="font-mono text-xs break-all">{boletoResult.invoice_id}</dd>
                        <dt className="text-muted-foreground">Código</dt><dd>{boletoResult.code}</dd>
                        <dt className="text-muted-foreground">Status</dt><dd><Badge variant="outline">{boletoResult.status}</Badge></dd>
                        <dt className="text-muted-foreground">Vencimento</dt><dd>{boletoResult.due_date}</dd>
                        <dt className="text-muted-foreground">Latência</dt><dd>{boletoResult.elapsed_ms} ms</dd>
                      </dl>

                      {boletoResult.digitable_line && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Linha digitável</Label>
                          <div className="flex gap-2">
                            <Input readOnly value={boletoResult.digitable_line} className="font-mono text-xs" />
                            <Button variant="outline" size="icon" onClick={() => copy(boletoResult.digitable_line)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {boletoResult.pix_emv && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">PIX Copia & Cola</Label>
                          <div className="flex gap-2">
                            <Input readOnly value={boletoResult.pix_emv} className="font-mono text-xs" />
                            <Button variant="outline" size="icon" onClick={() => copy(boletoResult.pix_emv)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {boletoResult.pdf_url && (
                        <Button asChild variant="outline">
                          <a href={boletoResult.pdf_url} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />Abrir PDF do boleto
                          </a>
                        </Button>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm break-words"><span className="text-muted-foreground">Erro:</span> {boletoResult.error}</p>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                ⚠️ Ambiente de produção: o boleto é real. Use valores baixos (R$ 1,00) para testar.
                Não persiste em vendas/parcelas.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
