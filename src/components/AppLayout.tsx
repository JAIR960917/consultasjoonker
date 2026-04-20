import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Search, History, Settings, Users, LogOut, Wallet, FileSignature,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, role, signOut } = useAuth();
  const { branding } = useBranding();
  const nav = useNavigate();

  const items = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, admin: false },
    { to: "/consulta", label: "Nova consulta", icon: Search, admin: false },
    { to: "/historico", label: "Histórico", icon: History, admin: false },
    { to: "/contratos", label: "Contratos", icon: FileSignature, admin: false },
    { to: "/configuracoes", label: "Configurações", icon: Settings, admin: true },
    { to: "/usuarios", label: "Usuários", icon: Users, admin: true },
  ];

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        <div className="px-6 py-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-accent shadow-glow overflow-hidden">
              {branding?.logo_url ? (
                <img src={branding.logo_url} alt={branding.app_name} className="h-full w-full object-contain" />
              ) : (
                <Wallet className="h-5 w-5 text-accent-foreground" />
              )}
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">{branding?.app_name ?? "CrediFlow"}</h1>
              <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">Crédito inteligente</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {items.filter((i) => !i.admin || role === "admin").map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-glow"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )
              }
            >
              <i.icon className="h-4 w-4" />
              {i.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border space-y-3">
          <div className="px-3 text-xs">
            <p className="truncate text-sidebar-foreground/60">{user?.email}</p>
            <p className="mt-0.5 inline-block rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-sidebar-accent-foreground">
              {role ?? "—"}
            </p>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={async () => { await signOut(); nav("/login"); }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
