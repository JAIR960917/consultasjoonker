import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Row {
  user_id: string;
  full_name: string;
  email: string;
  cidade: string;
  empresa_id: string | null;
  empresa_nome: string;
  role: string;
}

interface EmpresaOption {
  id: string;
  nome: string;
  cidade: string;
}

export default function Usuarios() {
  const [rows, setRows] = useState<Row[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    full_name: "", email: "", password: "", cidade: "", role: "gerente", empresa_id: "",
  });

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }, { data: emps }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, cidade, empresa_id"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("empresas").select("id, nome, cidade").eq("ativo", true).order("nome"),
    ]);
    const empMap = new Map((emps ?? []).map((e) => [e.id, e.nome]));
    const merged: Row[] = (profiles ?? []).map((p) => ({
      user_id: p.user_id,
      full_name: p.full_name,
      email: p.email,
      cidade: (p as { cidade?: string }).cidade ?? "",
      empresa_id: (p as { empresa_id?: string | null }).empresa_id ?? null,
      empresa_nome: empMap.get((p as { empresa_id?: string }).empresa_id ?? "") ?? "—",
      role: roles?.find((r) => r.user_id === p.user_id)?.role ?? "—",
    }));
    setRows(merged);
    setEmpresas((emps ?? []) as EmpresaOption[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.role === "gerente" && !form.empresa_id) {
      toast.error("Selecione a empresa do gerente");
      return;
    }
    setCreating(true);
    const payload = {
      ...form,
      empresa_id: form.empresa_id || null,
    };
    const { data, error } = await supabase.functions.invoke("admin-create-user", { body: payload });
    setCreating(false);
    if (error || (data as { error?: string })?.error) {
      toast.error("Erro ao criar usuário", { description: error?.message ?? (data as { error?: string }).error });
      return;
    }
    toast.success("Usuário criado");
    setForm({ full_name: "", email: "", password: "", cidade: "", role: "gerente", empresa_id: "" });
    load();
  };

  const roleLabel = (r: string) =>
    r === "admin" ? "Administrador" : r === "gerente" ? "Gerente" : r;

  // Auto-preenche cidade quando seleciona empresa
  const onEmpresaChange = (id: string) => {
    const emp = empresas.find((e) => e.id === id);
    setForm((f) => ({
      ...f,
      empresa_id: id,
      cidade: emp?.cidade || f.cidade,
    }));
  };

  return (
    <AppLayout>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Usuários</h1>
        <p className="text-muted-foreground">Gerencie gerentes e administradores</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card className="shadow-card">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">E-mail</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Cidade</th>
                  <th className="px-4 py-3 font-medium">Papel</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
                ) : rows.map((r) => (
                  <tr key={r.user_id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{r.full_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.empresa_nome}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.cidade || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.role === "admin" ? "bg-accent/15 text-accent-foreground" : "bg-muted text-muted-foreground"
                      }`}>{roleLabel(r.role)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="shadow-elegant h-fit">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Novo usuário</h2>
            </div>
            <form onSubmit={create} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome completo</Label>
                <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Senha (mín. 6)</Label>
                <Input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Papel</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gerente">Gerente</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Empresa {form.role === "gerente" && <span className="text-destructive">*</span>}</Label>
                <Select value={form.empresa_id} onValueChange={onEmpresaChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={empresas.length === 0 ? "Cadastre uma empresa primeiro" : "Selecione…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.nome}{e.cidade ? ` — ${e.cidade}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} placeholder="Ex.: São Paulo" />
              </div>
              <Button type="submit" disabled={creating} className="w-full bg-gradient-primary">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar usuário"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
