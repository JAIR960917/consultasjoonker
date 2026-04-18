import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Wallet, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function Login() {
  const { signIn, user, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: { pathname?: string } } };

  const [email, setEmail] = useState("jazevedosfilho@gmail.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Garante admin padrão
  useEffect(() => {
    supabase.functions.invoke("seed-admin").then(() => setSeeded(true)).catch(() => setSeeded(true));
  }, []);

  useEffect(() => {
    if (!loading && user) nav(loc.state?.from?.pathname || "/", { replace: true });
  }, [user, loading, nav, loc]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) {
      toast.error("Falha ao entrar", { description: error });
      return;
    }
    toast.success("Bem-vindo!");
    nav("/", { replace: true });
  };

  return (
    <div className="flex min-h-screen w-full bg-gradient-hero">
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-accent shadow-glow">
            <Wallet className="h-6 w-6 text-accent-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">CrediFlow</h1>
            <p className="text-xs uppercase tracking-widest text-primary-foreground/60">Crédito inteligente</p>
          </div>
        </div>

        <div className="max-w-md space-y-6">
          <h2 className="text-5xl font-bold leading-tight">
            Aprovação de crédito <span className="text-accent">em segundos.</span>
          </h2>
          <p className="text-lg text-primary-foreground/80">
            Consulte CPF, calcule entrada e parcelas com base em regras inteligentes
            que você mesmo configura.
          </p>
          <div className="flex items-center gap-3 rounded-lg border border-primary-foreground/15 bg-primary-foreground/5 px-4 py-3">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <p className="text-sm">Dados protegidos por autenticação e papéis</p>
          </div>
        </div>

        <p className="text-xs text-primary-foreground/50">© {new Date().getFullYear()} CrediFlow</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-elegant">
          <CardContent className="p-8">
            <h2 className="text-2xl font-bold">Acessar sua conta</h2>
            <p className="mt-1 text-sm text-muted-foreground">Entre com suas credenciais para continuar</p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full bg-gradient-primary shadow-elegant" size="lg" disabled={busy || !seeded}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
              </Button>
            </form>

            <div className="mt-6 rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Admin padrão</p>
              <p>jazevedosfilho@gmail.com</p>
              <p>Senha: 12457856</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
