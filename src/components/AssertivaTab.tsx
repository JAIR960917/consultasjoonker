import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, PlayCircle, KeyRound, CheckCircle2, XCircle, Copy, ExternalLink } from "lucide-react";

interface Empresa {
  id: string;
  nome: string;
  slug: string;
}

export function AssertivaTab() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [slug, setSlug] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => {
    supabase
      .from("empresas")
      .select("id,nome,slug")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => {
        const list = (data ?? []) as Empresa[];
        setEmpresas(list);
        if (list.length && !slug) setSlug(list[0].slug);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runDiag = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("assertiva-autentica-diag", {
        body: { empresa_slug: slug || undefined },
      });
      if (error) throw error;
      setResult(data);
      const ok = data?.attempts?.some((a: any) => a.access_token_present);
      if (ok) toast.success("Token gerado com sucesso");
      else toast.error("Falha em todas as variações", { description: "Veja a resposta detalhada abaixo" });
    } catch (err: any) {
      toast.error("Erro ao executar diagnóstico", { description: err?.message ?? String(err) });
      setResult({ error: err?.message ?? String(err) });
    } finally {
      setLoading(false);
    }
  };

  const suffix = (slug || "").toUpperCase();
  const idSecretName = `ASSERTIVA_CLIENT_ID_${suffix || "<EMPRESA>"}`;
  const secretSecretName = `ASSERTIVA_CLIENT_SECRET_${suffix || "<EMPRESA>"}`;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="grid gap-6">
      <Card className="shadow-card">
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Diagnóstico Assertiva Autentica</h2>
            <p className="text-sm text-muted-foreground">
              Testa a geração do token nas variações conhecidas (endpoint, Basic Auth vs body) e mostra a resposta bruta.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select value={slug} onValueChange={setSlug}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={e.slug}>
                      {e.nome} ({e.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={runDiag} disabled={loading || !slug} className="bg-gradient-primary">
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="mr-2 h-4 w-4" />
                )}
                Testar geração de token
              </Button>
            </div>
          </div>

          {result && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  {result?.attempts?.some((a: any) => a.access_token_present) ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span>Sucesso em pelo menos uma variação</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span>Todas as variações falharam</span>
                    </>
                  )}
                </div>
                {result?.client_id_preview && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Client ID: <code>{result.client_id_preview}</code> · Sufixo: <code>{result.secret_suffix || "(global)"}</code>
                  </p>
                )}
                {result?.diagnostico && (
                  <p className="mt-1 text-xs text-muted-foreground">{result.diagnostico}</p>
                )}
              </div>

              {Array.isArray(result?.attempts) &&
                result.attempts.map((a: any, i: number) => (
                  <div key={i} className="rounded-lg border bg-card p-3 text-xs">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {a.access_token_present ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        <span className="font-medium">
                          HTTP {a.http_status ?? "—"} · {a.auth_mode}
                        </span>
                      </div>
                      <code className="text-muted-foreground">{a.url}</code>
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2">
                      {JSON.stringify(a.response_body, null, 2)}
                    </pre>
                  </div>
                ))}

              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Ver JSON completo</summary>
                <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-2">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Atualizar credenciais Assertiva
            </h2>
            <p className="text-sm text-muted-foreground">
              Por segurança, as credenciais ficam armazenadas como secrets do backend. Atualize-as diretamente no painel do
              Lovable Cloud usando os nomes abaixo.
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <p className="text-sm font-medium">Para a empresa selecionada ({slug || "—"}), atualize estes dois secrets:</p>

            <div className="space-y-2">
              <SecretRow name={idSecretName} onCopy={() => copy(idSecretName, "Nome do secret")} />
              <SecretRow name={secretSecretName} onCopy={() => copy(secretSecretName, "Nome do secret")} />
            </div>

            <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1">
              <li>Pegue o <strong>Client ID</strong> e <strong>Client Secret</strong> em texto puro no painel da Assertiva (não use a string &quot;Basic ...&quot; codificada).</li>
              <li>Abra o painel de secrets do backend e atualize os dois nomes acima.</li>
              <li>Aguarde alguns segundos para a propagação e clique em <strong>Testar geração de token</strong> acima.</li>
            </ol>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" size="sm" asChild>
                <a
                  href="https://supabase.com/dashboard/project/vtiimbbrxsfqgmscqdnl/settings/functions"
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Abrir painel de secrets
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SecretRow({ name, onCopy }: { name: string; onCopy: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border bg-card px-3 py-2">
      <code className="text-xs sm:text-sm break-all">{name}</code>
      <Button variant="ghost" size="sm" onClick={onCopy}>
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}
