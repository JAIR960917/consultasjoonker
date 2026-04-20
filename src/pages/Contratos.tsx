import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileSignature, Search, FileDown, Eye, ShieldCheck, Loader2, FileText,
} from "lucide-react";
import { maskCpf } from "@/lib/finance";
import { downloadContractPdf } from "@/lib/pdf";

interface ContractRow {
  id: string;
  cpf: string;
  nome: string;
  endereco: string;
  telefone: string;
  content: string;
  status: string;
  signed_at: string | null;
  signature_url: string | null;
  signature_provider: string | null;
  signature_data: { signed_pdf_url?: string } | null;
  created_at: string;
}

interface TemplateRow {
  title: string;
  company_name: string;
  company_cnpj: string;
  company_address: string;
}

type Filter = "todos" | "assinado" | "aguardando_assinatura" | "pendente";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  assinado: { label: "Assinado", cls: "bg-success text-success-foreground" },
  aguardando_assinatura: { label: "Aguardando", cls: "bg-warning text-warning-foreground" },
  pendente: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
};

export default function Contratos() {
  const nav = useNavigate();
  const [list, setList] = useState<ContractRow[]>([]);
  const [tpl, setTpl] = useState<TemplateRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("todos");
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: contracts, error }, { data: template }] = await Promise.all([
        supabase.from("contracts").select("*").order("created_at", { ascending: false }),
        supabase.from("contract_template").select("title, company_name, company_cnpj, company_address").limit(1).maybeSingle(),
      ]);
      if (error) toast.error("Erro ao carregar contratos", { description: error.message });
      setList((contracts as ContractRow[]) ?? []);
      if (template) setTpl(template as TemplateRow);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((c) => {
      if (filter !== "todos" && c.status !== filter) return false;
      if (!q) return true;
      return (
        c.nome.toLowerCase().includes(q) ||
        c.cpf.replace(/\D/g, "").includes(q.replace(/\D/g, ""))
      );
    });
  }, [list, filter, search]);

  const counts = useMemo(() => ({
    todos: list.length,
    assinado: list.filter((c) => c.status === "assinado").length,
    aguardando_assinatura: list.filter((c) => c.status === "aguardando_assinatura").length,
    pendente: list.filter((c) => c.status === "pendente").length,
  }), [list]);

  const handleDownload = (c: ContractRow) => {
    if (!tpl) return;
    // Se tiver PDF oficial assinado (Assertiva), abre direto
    if (c.status === "assinado" && c.signature_data?.signed_pdf_url) {
      window.open(c.signature_data.signed_pdf_url, "_blank");
      return;
    }
    // Caso contrário, gera cópia local
    downloadContractPdf(
      {
        title: tpl.title,
        companyName: tpl.company_name,
        companyCnpj: tpl.company_cnpj,
        companyAddress: tpl.company_address,
        clientName: c.nome,
        clientCpf: maskCpf(c.cpf),
        content: c.content,
        signedAt: c.signed_at ? new Date(c.signed_at).toLocaleString("pt-BR") : null,
      },
      `contrato-${c.nome.replace(/\s+/g, "_")}.pdf`,
    );
  };

  return (
    <AppLayout>
      <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileSignature className="h-7 w-7 text-primary" />
            Contratos
          </h1>
          <p className="text-muted-foreground">Arquivo de contratos gerados, assinados e em andamento.</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou CPF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </header>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mb-4">
        <TabsList className="grid grid-cols-4 w-full sm:w-auto">
          <TabsTrigger value="todos">Todos ({counts.todos})</TabsTrigger>
          <TabsTrigger value="assinado">Assinados ({counts.assinado})</TabsTrigger>
          <TabsTrigger value="aguardando_assinatura">Aguardando ({counts.aguardando_assinatura})</TabsTrigger>
          <TabsTrigger value="pendente">Pendentes ({counts.pendente})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="shadow-elegant">
        <CardHeader>
          <CardTitle className="text-lg">
            {filtered.length} {filtered.length === 1 ? "contrato" : "contratos"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <FileText className="h-10 w-10 opacity-50" />
              <p>Nenhum contrato encontrado.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Assinado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const s = STATUS_LABEL[c.status] ?? STATUS_LABEL.pendente;
                  const hasOfficial = !!c.signature_data?.signed_pdf_url;
                  return (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/30" onClick={() => nav(`/contrato/${c.id}`)}>
                      <TableCell className="font-medium">{c.nome}</TableCell>
                      <TableCell className="font-mono text-sm">{maskCpf(c.cpf)}</TableCell>
                      <TableCell>
                        <Badge className={s.cls}>{s.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.signed_at ? new Date(c.signed_at).toLocaleString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => nav(`/contrato/${c.id}`)} title="Visualizar">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDownload(c)}
                            title={hasOfficial ? "Baixar PDF assinado oficial" : "Baixar cópia em PDF"}
                          >
                            {hasOfficial ? (
                              <ShieldCheck className="h-4 w-4 text-success" />
                            ) : (
                              <FileDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
