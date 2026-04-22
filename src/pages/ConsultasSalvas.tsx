import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, Database, Clock, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface CacheRow {
  id: string;
  cpf: string;
  nome: string | null;
  data_nascimento: string | null;
  score: number | null;
  consultado_em: string;
  expira_em: string;
}

function formatCPF(cpf: string) {
  const d = (cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export default function ConsultasSalvas() {
  const { role } = useAuth();
  const [rows, setRows] = useState<CacheRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState("");

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("consultas_cache")
      .select("id, cpf, nome, data_nascimento, score, consultado_em, expira_em")
      .order("consultado_em", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) {
      toast.error("Erro ao carregar consultas salvas");
      return;
    }
    setRows(data ?? []);
  };

  useEffect(() => { carregar(); }, []);

  const filtradas = useMemo(() => {
    const q = filtro.replace(/\D/g, "");
    if (!q && !filtro.trim()) return rows;
    return rows.filter((r) => {
      const cpfMatch = q && r.cpf.includes(q);
      const nomeMatch = filtro.trim() && r.nome?.toLowerCase().includes(filtro.trim().toLowerCase());
      return cpfMatch || nomeMatch;
    });
  }, [rows, filtro]);

  const remover = async (id: string) => {
    if (!confirm("Remover esta consulta do cache? Na próxima consulta o sistema buscará novamente na Serasa.")) return;
    const { error } = await supabase.from("consultas_cache").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover");
      return;
    }
    toast.success("Removida do cache");
    setRows((r) => r.filter((x) => x.id !== id));
  };

  const ativos = rows.filter((r) => new Date(r.expira_em) > new Date()).length;
  const expirados = rows.length - ativos;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Consultas Salvas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            CPFs consultados nos últimos 3 meses são reutilizados automaticamente, evitando uma nova chamada à Serasa.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Total no cache</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{rows.length}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Ativos (válidos)</CardTitle>
              <Clock className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold text-success">{ativos}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Expirados</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold text-muted-foreground">{expirados}</div></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Buscar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar por CPF ou nome…"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{filtradas.length} consulta(s)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : filtradas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma consulta encontrada.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CPF</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Nascimento</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead>Consultado</TableHead>
                      <TableHead>Validade</TableHead>
                      {role === "admin" && <TableHead className="text-right">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtradas.map((r) => {
                      const expirado = new Date(r.expira_em) <= new Date();
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono">{formatCPF(r.cpf)}</TableCell>
                          <TableCell>{r.nome ?? "—"}</TableCell>
                          <TableCell>
                            {r.data_nascimento
                              ? format(new Date(r.data_nascimento + "T00:00:00"), "dd/MM/yyyy")
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right font-semibold">{r.score ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(r.consultado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            {expirado ? (
                              <Badge variant="secondary">Expirado</Badge>
                            ) : (
                              <Badge variant="outline" className="text-success border-success/30">
                                Expira {formatDistanceToNow(new Date(r.expira_em), { locale: ptBR, addSuffix: true })}
                              </Badge>
                            )}
                          </TableCell>
                          {role === "admin" && (
                            <TableCell className="text-right">
                              <Button size="sm" variant="ghost" onClick={() => remover(r.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
