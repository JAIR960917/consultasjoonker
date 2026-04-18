import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl, maskCpf } from "@/lib/finance";

interface Venda {
  id: string;
  cpf: string;
  nome: string | null;
  score: number | null;
  valor_total: number;
  valor_entrada: number;
  parcelas: number;
  valor_parcela: number;
  status: string;
  created_at: string;
}

export default function Historico() {
  const [vendas, setVendas] = useState<Venda[]>([]);

  useEffect(() => {
    supabase.from("vendas").select("*").order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setVendas((data as Venda[]) ?? []));
  }, []);

  return (
    <AppLayout>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Histórico de vendas</h1>
        <p className="text-muted-foreground">Últimas 100 operações</p>
      </header>

      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Entrada</TableHead>
                <TableHead>Parcelas</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendas.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sem vendas ainda</TableCell></TableRow>
              ) : vendas.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="text-xs">{new Date(v.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="font-medium">{v.nome ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{maskCpf(v.cpf)}</TableCell>
                  <TableCell className="text-right">{v.score}</TableCell>
                  <TableCell className="text-right">{brl(Number(v.valor_total))}</TableCell>
                  <TableCell className="text-right">{brl(Number(v.valor_entrada))}</TableCell>
                  <TableCell>{v.parcelas}x {brl(Number(v.valor_parcela))}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      v.status === "aprovado" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                    }`}>{v.status}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
