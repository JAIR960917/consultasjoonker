import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, PlayCircle, KeyRound, CheckCircle2, XCircle } from "lucide-react";

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

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [savingCreds, setSavingCreds] = useState(false);

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

  const updateCreds = async () => {
    if (!slug) return toast.error("Selecione uma empresa");
    if (!clientId.trim() || !clientSecret.trim()) {
      return toast.error("Preencha Client ID e Client Secret");
    }
    setSavingCreds(true);
    try {
      const { data, error } = await supabase.functions.invoke("assertiva-update-credentials", {
        body: {
          empresa_slug: slug,
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao atualizar credenciais");
      toast.success("Credenciais atualizadas", {
        description: "Agora rode o diagnóstico para validar.",
      });
      setClientId("");
      setClientSecret("");
    } catch (err: any) {
      toast.error("Erro ao atualizar credenciais", { description: err?.message ?? String(err) });
    } finally {
      setSavingCreds(false);
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
              Cole o <strong>Client ID</strong> e <strong>Client Secret</strong> em texto puro, exatamente como aparecem no painel
              da Assertiva (não cole a string &quot;Basic ...&quot; codificada).
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Client ID</Label>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="ex: 12345-abcde-..."
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>Client Secret</Label>
              <Input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="••••••••"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={updateCreds} disabled={savingCreds || !slug}>
              {savingCreds ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar credenciais para {slug || "—"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Os valores são armazenados como secrets em <code>ASSERTIVA_CLIENT_ID_{slug?.toUpperCase() || "<EMPRESA>"}</code> e
            <code> ASSERTIVA_CLIENT_SECRET_{slug?.toUpperCase() || "<EMPRESA>"}</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
