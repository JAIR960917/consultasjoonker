import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Search, History, TrendingUp, CheckCircle2, XCircle } from "lucide-react";
import { brl } from "@/lib/finance";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ consultas: 0, vendas: 0, aprovadas: 0, recusadas: 0, total: 0 });

  useEffect(() => {
    const load = async () => {
      const [{ count: c1 }, { data: vendas }] = await Promise.all([
        supabase.from("consultas").select("*", { count: "exact", head: true }),
        supabase.from("vendas").select("status, valor_total"),
      ]);
      const aprov = vendas?.filter((v) => v.status === "aprovado") ?? [];
      const recus = vendas?.filter((v) => v.status === "recusado") ?? [];
      setStats({
        consultas: c1 ?? 0,
        vendas: vendas?.length ?? 0,
        aprovadas: aprov.length,
        recusadas: recus.length,
        total: aprov.reduce((s, v) => s + Number(v.valor_total), 0),
      });
    };
    load();
  }, []);

  const cards = [
    { label: "Consultas", value: stats.consultas, icon: Search, color: "text-primary" },
    { label: "Vendas aprovadas", value: stats.aprovadas, icon: CheckCircle2, color: "text-success" },
    { label: "Vendas recusadas", value: stats.recusadas, icon: XCircle, color: "text-destructive" },
    { label: "Volume aprovado", value: brl(stats.total), icon: TrendingUp, color: "text-accent" },
  ];

  return (
    <AppLayout>
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">Olá, {user?.email?.split("@")[0]}</p>
        <h1 className="text-3xl font-bold tracking-tight">Painel</h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="shadow-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <c.icon className={`h-5 w-5 ${c.color}`} />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card className="shadow-elegant bg-gradient-primary text-primary-foreground">
          <CardContent className="p-6">
            <Search className="h-7 w-7 text-accent" />
            <h3 className="mt-4 text-xl font-semibold">Consultar CPF</h3>
            <p className="mt-1 text-sm text-primary-foreground/80">
              Busque dados, score e simule a venda na hora.
            </p>
            <Button asChild className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/consulta">Nova consulta</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-6">
            <History className="h-7 w-7 text-primary" />
            <h3 className="mt-4 text-xl font-semibold">Histórico</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Veja as últimas consultas e vendas registradas.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/historico">Abrir histórico</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
