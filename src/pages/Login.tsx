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
import { useBranding } from "@/contexts/BrandingContext";

export default function Login() {
  const { signIn, user, loading } = useAuth();
  const { branding } = useBranding();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: { pathname?: string } } };

  const [email, setEmail] = useState("jazevedosfilho@gmail.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState(false);

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

  const appName = branding?.app_name || "CrediFlow";
  const tagline = branding?.login_tagline || "Crédito inteligente";
  const title = branding?.login_title || "Aprovação de crédito em segundos.";
  const subtitle = branding?.login_subtitle || "";
  const badge = branding?.login_badge || "";

  return (
    <div className="flex min-h-screen w-full bg-gradient-hero">
      {/* Lado esquerdo — usa cores da sidebar para garantir contraste em qualquer tema */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3">
          {branding?.logo_url ? (
            <img src={branding.logo_url} alt={appName} className="h-11 w-11 object-contain" />
          ) : (
            <Wallet className="h-8 w-8 text-accent" />
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{appName}</h1>
            <p className="text-xs uppercase tracking-widest opacity-70">{tagline}</p>
          </div>
        </div>

        <div className="max-w-md space-y-6">
          <h2 className="text-5xl font-bold leading-tight">{title}</h2>
          {subtitle && <p className="text-lg opacity-80">{subtitle}</p>}
          {badge && (
            <div className="flex items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-4 py-3">
              <ShieldCheck className="h-5 w-5 text-accent" />
              <p className="text-sm">{badge}</p>
            </div>
          )}
        </div>

        <p className="text-xs opacity-60">© {new Date().getFullYear()} {appName}</p>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
