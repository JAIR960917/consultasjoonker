import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Zap } from "lucide-react";

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

export function CoraTab() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuthResult | null>(null);

  const testar = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke<AuthResult>(
        "cora-auth-test",
        { body: {} },
      );
      if (error) {
        setResult({ ok: false, error: error.message });
        toast.error("Falha ao chamar edge function", { description: error.message });
      } else {
        setResult(data ?? { ok: false, error: "Sem resposta" });
        if (data?.ok) toast.success("Autenticação Cora OK");
        else toast.error("Autenticação Cora falhou", { description: data?.error });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ ok: false, error: msg });
      toast.error("Erro inesperado", { description: msg });
    } finally {
      setLoading(false);
    }
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

          <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
            <p className="font-medium">Credenciais cadastradas (secrets):</p>
            <ul className="list-disc pl-5 text-muted-foreground">
              <li>CORA_CLIENT_ID</li>
              <li>CORA_CERTIFICATE</li>
              <li>CORA_PRIVATE_KEY</li>
            </ul>
          </div>

          <Button onClick={testar} disabled={loading} size="lg">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Autenticando...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Testar autenticação
              </>
            )}
          </Button>

          {result && (
            <div
              className={`rounded-lg border p-4 ${
                result.ok
                  ? "border-success/40 bg-success/5"
                  : "border-destructive/40 bg-destructive/5"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold mb-2">
                {result.ok ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <span>Sucesso</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-destructive" />
                    <span>Falha</span>
                  </>
                )}
              </div>
              {result.ok ? (
                <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Mensagem</dt>
                  <dd>{result.message}</dd>
                  <dt className="text-muted-foreground">Token type</dt>
                  <dd>{result.token_type ?? "—"}</dd>
                  <dt className="text-muted-foreground">Expira em</dt>
                  <dd>{result.expires_in ? `${result.expires_in}s` : "—"}</dd>
                  <dt className="text-muted-foreground">Scope</dt>
                  <dd>{result.scope ?? "—"}</dd>
                  <dt className="text-muted-foreground">Latência</dt>
                  <dd>{result.elapsed_ms ? `${result.elapsed_ms} ms` : "—"}</dd>
                  <dt className="text-muted-foreground">Token (preview)</dt>
                  <dd className="font-mono text-xs">{result.access_token_preview ?? "—"}</dd>
                </dl>
              ) : (
                <div className="space-y-1 text-sm">
                  {result.status && (
                    <p>
                      <span className="text-muted-foreground">HTTP:</span> {result.status}
                    </p>
                  )}
                  <p className="break-words">
                    <span className="text-muted-foreground">Erro:</span> {result.error}
                  </p>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Este teste solicita um <code>access_token</code> via OAuth2 (client_credentials)
            com mTLS usando o certificado cadastrado. Nenhum boleto é gerado.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
