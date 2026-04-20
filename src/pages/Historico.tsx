import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { brl, maskCpf } from "@/lib/finance";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [target, setTarget] = useState<Venda | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    supabase.from("vendas").select("*").order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setVendas((data as Venda[]) ?? []));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async () => {
    if (!target) return;
    setDeleting(true);

    // Bloqueia se houver boleto emitido para esta venda
    const { data: emitidas, error: checkError } = await supabase
      .from("parcelas")
      .select("id")
      .eq("venda_id", target.id)
      .not("cora_invoice_id", "is", null);

    if (checkError) {
      setDeleting(false);
      toast.error("Erro ao verificar boletos", { description: checkError.message });
      return;
    }

    if (emitidas && emitidas.length > 0) {
      setDeleting(false);
      setTarget(null);
      toast.error("Não é possível excluir esta venda", {
        description: `Existem ${emitidas.length} boleto(s) emitido(s) no nome do cliente. Cancele os boletos no Cora antes de excluir.`,
      });
      return;
    }

    // Remove parcelas, contratos vinculados e a venda
    await supabase.from("parcelas").delete().eq("venda_id", target.id);
    await supabase.from("contracts").delete().eq("venda_id", target.id);
    const { error } = await supabase.from("vendas").delete().eq("id", target.id);
    setDeleting(false);

    if (error) {
      toast.error("Erro ao excluir venda", { description: error.message });
      return;
    }
    toast.success("Venda excluída");
    setTarget(null);
    load();
  };

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
                {isAdmin && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendas.length === 0 ? (
                <TableRow><TableCell colSpan={isAdmin ? 9 : 8} className="text-center text-muted-foreground py-8">Sem vendas ainda</TableCell></TableRow>
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
                  {isAdmin && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => setTarget(v)}
                        title="Excluir venda"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir venda do histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. A venda, suas parcelas e o contrato vinculado serão removidos.
              Vendas com boletos já emitidos no Cora não podem ser excluídas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
