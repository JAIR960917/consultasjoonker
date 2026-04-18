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
  role: string;
}

export default function Usuarios() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "operador" });

  const load = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const merged: Row[] = (profiles ?? []).map((p) => ({
      user_id: p.user_id,
      full_name: p.full_name,
      email: p.email,
      role: roles?.find((r) => r.user_id === p.user_id)?.role ?? "—",
    }));
    setRows(merged);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", { body: form });
    setCreating(false);
    if (error || (data as { error?: string })?.error) {
      toast.error("Erro ao criar usuário", { description: error?.message ?? (data as { error?: string }).error });
      return;
    }
    toast.success("Usuário criado");
    setForm({ full_name: "", email: "", password: "", role: "operador" });
    load();
  };

  return (
    <AppLayout>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Usuários</h1>
        <p className="text-muted-foreground">Gerencie operadores e administradores</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card className="shadow-card">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b text-left">
                <tr><th className="px-4 py-3 font-medium">Nome</th><th className="px-4 py-3 font-medium">E-mail</th><th className="px-4 py-3 font-medium">Papel</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={3} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
                ) : rows.map((r) => (
                  <tr key={r.user_id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{r.full_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.role === "admin" ? "bg-accent/15 text-accent-foreground" : "bg-muted text-muted-foreground"
                      }`}>{r.role}</span>
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
                    <SelectItem value="operador">Operador</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
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
