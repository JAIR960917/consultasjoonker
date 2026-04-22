import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, PlayCircle, KeyRound, CheckCircle2, XCircle, Copy, ExternalLink, Webhook, Trash2 } from "lucide-react";

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
  const [whLoading, setWhLoading] = useState(false);
  const [whResult, setWhResult] = useState<any | null>(null);
  const [whList, setWhList] = useState<any[] | null>(null);

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

  const callWebhook = async (action: "register" | "list" | "delete", id?: string) => {
    setWhLoading(true);
    setWhResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("assertiva-registrar-webhook", {
        body: { empresa_slug: slug || undefined, action, id },
      });
      if (error) throw error;
      setWhResult(data);
      if (action === "list") {
        const arr = data?.data?.configuracoes ?? [];
        setWhList(Array.isArray(arr) ? arr : []);
      } else if (action === "register") {
        if (data?.ok) {
          toast.success(data?.mode === "updated" ? "Webhook atualizado na Assertiva" : "Webhook cadastrado na Assertiva");
          // Atualiza lista
          await callWebhook("list");
        } else {
          toast.error("Falha ao registrar webhook", { description: data?.error });
        }
      } else if (action === "delete") {
        if (data?.ok) {
          toast.success("Webhook removido");
          await callWebhook("list");
        } else {
          toast.error("Falha ao remover", { description: data?.error });
        }
      }
    } catch (err: any) {
      toast.error("Erro na chamada", { description: err?.message ?? String(err) });
    } finally {
      setWhLoading(false);
    }
  };

  const suffix = (slug || "").toUpperCase();
  const suffixLower = (slug || "").toLowerCase();
  const idSecretName = `ASSERTIVA_CLIENT_ID_${suffix || "<EMPRESA>"}`;
  const secretSecretName = `ASSERTIVA_CLIENT_SECRET_${suffix || "<EMPRESA>"}`;
  const authTokenName = `ASSERTIVA_AUTH_TOKEN_${suffixLower || "<empresa>"}`;

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
            <p className="text-sm font-medium">Para a empresa selecionada ({slug || "—"}), atualize estes secrets:</p>

            <div className="space-y-2">
              <SecretRow name={idSecretName} onCopy={() => copy(idSecretName, "Nome do secret")} />
              <SecretRow name={secretSecretName} onCopy={() => copy(secretSecretName, "Nome do secret")} />
              <SecretRow name={authTokenName} onCopy={() => copy(authTokenName, "Nome do secret")} hint="Token Bearer pronto (opcional, sobrepõe Client ID/Secret)" />
            </div>

            <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1">
              <li>No painel da Assertiva, copie o <strong>Client ID</strong> e <strong>Client Secret</strong> em texto puro (não use a string &quot;Basic ...&quot; codificada).</li>
              <li>
                Abra o painel de secrets do backend e atualize os valores.{" "}
                <a
                  href={`https://supabase.com/dashboard/project/${import.meta.env.VITE_SUPABASE_PROJECT_ID}/settings/functions`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline"
                >
                  Abrir painel de secrets <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>Aguarde alguns segundos para a propagação e clique em <strong>Testar geração de token</strong> acima.</li>
            </ol>

            <p className="text-xs text-muted-foreground">
              Alternativa: se a Assertiva já te entregou um <strong>Bearer Token</strong> pronto (sem expiração curta), salve em
              <code className="mx-1">{authTokenName}</code> e o sistema usará ele direto, ignorando Client ID/Secret.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Webhook de notificação
            </h2>
            <p className="text-sm text-muted-foreground">
              Cadastra na Assertiva o endpoint que recebe o status dos pedidos de assinatura.
              A URL é montada automaticamente para a empresa selecionada.
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
            <p className="text-muted-foreground">URL que será cadastrada:</p>
            <code className="block break-all">
              {import.meta.env.VITE_SUPABASE_URL}/functions/v1/assertiva-webhook?slug={slug || "<empresa>"}
            </code>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => callWebhook("register")} disabled={whLoading || !slug} className="bg-gradient-primary">
              {whLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Webhook className="mr-2 h-4 w-4" />}
              Registrar / atualizar webhook
            </Button>
            <Button variant="outline" onClick={() => callWebhook("list")} disabled={whLoading || !slug}>
              {whLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Listar webhooks cadastrados
            </Button>
          </div>

          {Array.isArray(whList) && whList.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Webhooks cadastrados na Assertiva ({whList.length})</p>
              {whList.map((w: any) => (
                <div key={w.id} className="rounded border bg-card p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {w.ativo ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <code className="break-all">{w?.configuracao?.url ?? "—"}</code>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => callWebhook("delete", w.id)}
                      disabled={whLoading}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <p className="text-muted-foreground">id: {w.id}</p>
                </div>
              ))}
            </div>
          )}
          {Array.isArray(whList) && whList.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum webhook cadastrado ainda nesta empresa.</p>
          )}

          {whResult && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Ver resposta completa</summary>
              <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-2">
                {JSON.stringify(whResult, null, 2)}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SecretRow({ name, onCopy, hint }: { name: string; onCopy: () => void; hint?: string }) {
  return (
    <div className="rounded border bg-card px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <code className="text-xs sm:text-sm break-all">{name}</code>
        <Button variant="ghost" size="sm" onClick={onCopy}>
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
