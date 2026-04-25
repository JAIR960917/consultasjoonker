import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Building2, Plus, Pencil, Trash2, KeyRound, Copy, Check } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface Empresa {
  id: string;
  nome: string;
  cnpj: string;
  cidade: string;
  slug: string;
  ativo: boolean;
  telefone: string | null;
  created_at: string;
}

const emptyForm = { nome: "", cnpj: "", cidade: "", slug: "", ativo: true, telefone: "" };

function maskPhoneLocal(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function maskCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function slugify(nome: string) {
  return nome
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

export default function Empresas() {
  const [rows, setRows] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Empresa | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [credEmpresa, setCredEmpresa] = useState<Empresa | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Copiado");
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("empresas")
      .select("*")
      .order("nome", { ascending: true });
    if (error) toast.error("Erro ao carregar empresas", { description: error.message });
    setRows((data ?? []) as Empresa[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (e: Empresa) => {
    setEditing(e);
    setForm({ nome: e.nome, cnpj: e.cnpj, cidade: e.cidade, slug: e.slug, ativo: e.ativo });
    setDialogOpen(true);
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    const payload = {
      nome: form.nome.trim(),
      cnpj: form.cnpj.replace(/\D/g, ""),
      cidade: form.cidade.trim(),
      slug: form.slug.trim().toUpperCase(),
      ativo: form.ativo,
    };
    if (!payload.nome || !payload.cnpj || !payload.slug) {
      toast.error("Preencha nome, CNPJ e slug");
      setSaving(false);
      return;
    }
    if (!/^[A-Z0-9_]+$/.test(payload.slug)) {
      toast.error("Slug inválido", { description: "Use apenas A-Z, 0-9 e _" });
      setSaving(false);
      return;
    }

    const isCreating = !editing;
    const { data, error } = editing
      ? await supabase.from("empresas").update(payload).eq("id", editing.id).select().single()
      : await supabase.from("empresas").insert(payload).select().single();

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      return;
    }
    toast.success(editing ? "Empresa atualizada" : "Empresa criada");
    setDialogOpen(false);
    await load();

    // Após criar nova empresa, abre o modal de credenciais automaticamente
    if (isCreating && data) {
      setCredEmpresa(data as Empresa);
    }
  };

  const remover = async (id: string) => {
    const { error } = await supabase.from("empresas").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover", { description: error.message }); return; }
    toast.success("Empresa removida");
    load();
  };

  return (
    <AppLayout>
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Empresas</h1>
          <p className="text-muted-foreground">Cadastre as empresas que utilizarão contas Cora separadas</p>
        </div>
        <Button onClick={openCreate} className="bg-gradient-primary">
          <Plus className="mr-2 h-4 w-4" /> Nova empresa
        </Button>
      </header>

      <Card className="shadow-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Building2 className="mx-auto mb-2 h-8 w-8 opacity-40" />
              Nenhuma empresa cadastrada ainda.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{maskCnpj(r.cnpj)}</TableCell>
                    <TableCell>{r.cidade || "—"}</TableCell>
                    <TableCell><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.slug}</code></TableCell>
                    <TableCell>
                      {r.ativo
                        ? <Badge className="bg-success text-success-foreground">Ativa</Badge>
                        : <Badge variant="secondary">Inativa</Badge>}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => setCredEmpresa(r)} title="Ver credenciais">
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover {r.nome}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Os usuários e vendas vinculados ficarão sem empresa. Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remover(r.id)}>Remover</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6 border-dashed">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 text-primary" />
            <div className="space-y-2 text-sm">
              <p className="font-semibold">Credenciais Cora por empresa</p>
              <p className="text-muted-foreground">
                Para cada empresa, cadastre 3 secrets (substitua <code className="rounded bg-muted px-1">SLUG</code> pelo slug da empresa):
              </p>
              <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                <li><code className="rounded bg-muted px-1">CORA_CLIENT_ID_SLUG</code></li>
                <li><code className="rounded bg-muted px-1">CORA_CERTIFICATE_SLUG</code></li>
                <li><code className="rounded bg-muted px-1">CORA_PRIVATE_KEY_SLUG</code></li>
              </ul>
              <p className="text-muted-foreground">
                Se a empresa não tiver secrets próprios, o sistema usará as credenciais Cora padrão (atual conta de teste).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar empresa" : "Nova empresa"}</DialogTitle>
            <DialogDescription>
              O slug será usado para nomear os secrets Cora desta empresa.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                required
                value={form.nome}
                onChange={(e) => {
                  const nome = e.target.value;
                  setForm((f) => ({
                    ...f,
                    nome,
                    slug: editing ? f.slug : slugify(nome),
                  }));
                }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>CNPJ</Label>
                <Input
                  required
                  value={maskCnpj(form.cnpj)}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input
                  value={form.cidade}
                  onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Slug (A-Z, 0-9, _)</Label>
              <Input
                required
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })}
                placeholder="EX: OTICA_CENTRO"
              />
              <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1.5">
                <p className="font-medium text-foreground">Após salvar, cadastre os 5 secrets desta empresa:</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  <li><code className="text-foreground">CORA_CLIENT_ID_{form.slug || "SLUG"}</code></li>
                  <li><code className="text-foreground">CORA_CERTIFICATE_{form.slug || "SLUG"}</code></li>
                  <li><code className="text-foreground">CORA_PRIVATE_KEY_{form.slug || "SLUG"}</code></li>
                  <li><code className="text-foreground">ASSERTIVA_CLIENT_ID_{form.slug || "SLUG"}</code></li>
                  <li><code className="text-foreground">ASSERTIVA_CLIENT_SECRET_{form.slug || "SLUG"}</code></li>
                  <li><code className="text-foreground">ASSERTIVA_WEBHOOK_SECRET_{form.slug || "SLUG"}</code> (opcional)</li>
                </ul>
                <p className="text-muted-foreground pt-1">
                  Use o botão <KeyRound className="inline h-3 w-3" /> na lista para copiar os nomes e a URL do webhook.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Ativa</p>
                <p className="text-xs text-muted-foreground">Empresas inativas não aparecem no cadastro de gerentes</p>
              </div>
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="bg-gradient-primary">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo de credenciais por empresa */}
      <Dialog open={!!credEmpresa} onOpenChange={(o) => !o && setCredEmpresa(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Credenciais — {credEmpresa?.nome}</DialogTitle>
            <DialogDescription>
              As chaves reais (Client ID, Certificate, Private Key) ficam guardadas no
              <strong> cofre seguro do Lovable Cloud</strong> — não no app. Copie os nomes abaixo
              e peça ao desenvolvedor (ou na própria conversa do Lovable) para cadastrá-los.
            </DialogDescription>
          </DialogHeader>

          {credEmpresa && (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border-2 border-primary/40 bg-primary/5 p-3">
                <p className="font-semibold text-foreground mb-1">📋 Como cadastrar:</p>
                <ol className="ml-4 list-decimal space-y-0.5 text-xs text-muted-foreground">
                  <li>Copie cada nome abaixo (botão <Copy className="inline h-3 w-3" />)</li>
                  <li>Diga no chat: <em>"cadastrar secrets do Cora para empresa {credEmpresa.slug}"</em></li>
                  <li>O Lovable abrirá um formulário seguro para você colar os valores</li>
                </ol>
              </div>

              <div>
                <p className="mb-1.5 font-medium">🏦 Cora (boletos/PIX) — obrigatório</p>
                <div className="space-y-1.5">
                  {[
                    `CORA_CLIENT_ID_${credEmpresa.slug}`,
                    `CORA_CERTIFICATE_${credEmpresa.slug}`,
                    `CORA_PRIVATE_KEY_${credEmpresa.slug}`,
                  ].map((s) => (
                    <SecretRow key={s} value={s} copiedKey={copiedKey} onCopy={copyText} />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 font-medium">✍️ Assertiva (assinatura) — opcional</p>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  Só cadastre se esta empresa tiver conta Assertiva separada. Caso contrário,
                  o sistema usa as credenciais globais já configuradas.
                </p>
                <div className="space-y-1.5">
                  {[
                    `ASSERTIVA_CLIENT_ID_${credEmpresa.slug}`,
                    `ASSERTIVA_CLIENT_SECRET_${credEmpresa.slug}`,
                    `ASSERTIVA_WEBHOOK_SECRET_${credEmpresa.slug}`,
                  ].map((s) => (
                    <SecretRow key={s} value={s} copiedKey={copiedKey} onCopy={copyText} />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 font-medium">🔗 URL do webhook Assertiva</p>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  Só relevante se você cadastrar credenciais Assertiva próprias acima.
                </p>
                <SecretRow
                  value={`${SUPABASE_URL}/functions/v1/assertiva-webhook?slug=${credEmpresa.slug}`}
                  copiedKey={copiedKey}
                  onCopy={copyText}
                />
              </div>

              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                <p>
                  <strong>Serasa</strong> é sempre global — não precisa cadastrar por empresa.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCredEmpresa(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function SecretRow({
  value, copiedKey, onCopy,
}: {
  value: string;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const isCopied = copiedKey === value;
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5">
      <code className="flex-1 truncate text-xs">{value}</code>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={() => onCopy(value, value)}
      >
        {isCopied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
