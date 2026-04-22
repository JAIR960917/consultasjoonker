import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, FileSignature, Search, Building2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Empresa { id: string; nome: string; cidade: string }
interface Linha { empresa_id: string | null; nome: string; cidade: string; consultas: number; contratos: number }

export default function RelatoriosEmpresa() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState<string>("todas");
  const [dataInicio, setDataInicio] = useState<Date | undefined>(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d;
  });
  const [dataFim, setDataFim] = useState<Date | undefined>(new Date());
  const [loading, setLoading] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([]);

  useEffect(() => {
    supabase.from("empresas").select("id, nome, cidade").eq("ativo", true).order("nome")
      .then(({ data }) => setEmpresas(data ?? []));
  }, []);

  const carregar = async () => {
    if (!dataInicio || !dataFim) {
      toast.error("Selecione o período");
      return;
    }
    setLoading(true);
    try {
      const inicio = new Date(dataInicio); inicio.setHours(0, 0, 0, 0);
      const fim = new Date(dataFim); fim.setHours(23, 59, 59, 999);

      // Consultas não têm empresa_id; buscamos por cidade do usuário via join em profiles
      // Estratégia: buscar consultas e contracts no período e agrupar por cidade/empresa
      const [{ data: contratos, error: e1 }, { data: consultas, error: e2 }, { data: profiles, error: e3 }] = await Promise.all([
        supabase.from("contracts")
          .select("id, empresa_id, cidade, user_id")
          .gte("created_at", inicio.toISOString())
          .lte("created_at", fim.toISOString()),
        supabase.from("consultas")
          .select("id, cidade, user_id")
          .gte("created_at", inicio.toISOString())
          .lte("created_at", fim.toISOString()),
        supabase.from("profiles").select("user_id, empresa_id, cidade"),
      ]);

      if (e1 || e2 || e3) throw new Error(e1?.message || e2?.message || e3?.message);

      const userToEmpresa = new Map<string, string | null>();
      (profiles ?? []).forEach((p) => userToEmpresa.set(p.user_id, p.empresa_id));

      const map = new Map<string, Linha>();
      const empresaById = new Map(empresas.map((e) => [e.id, e]));
      const ensure = (id: string | null, fallbackCidade: string): Linha => {
        const key = id ?? `__sem__${fallbackCidade}`;
        if (!map.has(key)) {
          const emp = id ? empresaById.get(id) : null;
          map.set(key, {
            empresa_id: id,
            nome: emp?.nome ?? "Sem empresa",
            cidade: emp?.cidade ?? fallbackCidade ?? "—",
            consultas: 0,
            contratos: 0,
          });
        }
        return map.get(key)!;
      };

      (contratos ?? []).forEach((c) => {
        const eId = c.empresa_id ?? userToEmpresa.get(c.user_id) ?? null;
        ensure(eId, c.cidade ?? "—").contratos += 1;
      });
      (consultas ?? []).forEach((c) => {
        const eId = userToEmpresa.get(c.user_id) ?? null;
        ensure(eId, c.cidade ?? "—").consultas += 1;
      });

      let result = Array.from(map.values());
      if (empresaId !== "todas") {
        result = result.filter((r) => r.empresa_id === empresaId);
      }
      result.sort((a, b) => (b.contratos + b.consultas) - (a.contratos + a.consultas));
      setLinhas(result);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (empresas.length) carregar(); /* eslint-disable-next-line */ }, [empresas]);

  const totais = useMemo(() => ({
    consultas: linhas.reduce((s, l) => s + l.consultas, 0),
    contratos: linhas.reduce((s, l) => s + l.contratos, 0),
    empresas: linhas.length,
  }), [linhas]);

  return (
    <AppLayout>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Relatórios por Empresa</h1>
        <p className="text-sm text-muted-foreground">Consultas e contratos gerados por empresa, com filtro de período.</p>
      </header>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Empresa</label>
              <Select value={empresaId} onValueChange={setEmpresaId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Data início</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dataInicio && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataInicio ? format(dataInicio, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dataInicio} onSelect={setDataInicio} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Data fim</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dataFim && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataFim ? format(dataFim, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dataFim} onSelect={setDataFim} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-end">
              <Button onClick={carregar} disabled={loading} className="w-full">
                {loading ? "Carregando..." : "Aplicar filtros"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Empresas</p>
              <p className="mt-1 text-2xl font-bold">{totais.empresas}</p>
            </div>
            <Building2 className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Consultas</p>
              <p className="mt-1 text-2xl font-bold">{totais.consultas}</p>
            </div>
            <Search className="h-5 w-5 text-accent" />
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Contratos</p>
              <p className="mt-1 text-2xl font-bold">{totais.contratos}</p>
            </div>
            <FileSignature className="h-5 w-5 text-success" />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Detalhamento</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead className="text-right">Consultas</TableHead>
                <TableHead className="text-right">Contratos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {loading ? "Carregando..." : "Nenhum dado para o período selecionado."}
                  </TableCell>
                </TableRow>
              )}
              {linhas.map((l) => (
                <TableRow key={(l.empresa_id ?? "sem") + l.cidade}>
                  <TableCell className="font-medium">{l.nome}</TableCell>
                  <TableCell>{l.cidade}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.consultas}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.contratos}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
