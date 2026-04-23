import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  LayoutDashboard, Search, History, Settings, Users, LogOut, Wallet, FileSignature, Sun, Moon, Menu, Building2, BarChart3, Database, ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, role, signOut } = useAuth();
  const { branding } = useBranding();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, admin: false },
    { to: "/consulta", label: "Nova consulta", icon: Search, admin: false },
    { to: "/historico", label: "Histórico", icon: History, admin: false },
    { to: "/contratos", label: "Contratos", icon: FileSignature, admin: false },
    { to: "/consultas-salvas", label: "Consultas Salvas", icon: Database, admin: false },
    { to: "/relatorios-diarios", label: "Relatórios Diários", icon: ClipboardList, admin: false },
    { to: "/configuracoes", label: "Configurações", icon: Settings, admin: true },
    { to: "/usuarios", label: "Usuários", icon: Users, admin: true },
    { to: "/empresas", label: "Empresas", icon: Building2, admin: true },
    { to: "/relatorios-empresa", label: "Relatórios por Empresa", icon: BarChart3, admin: true },
  ];

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <div className="px-6 py-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden">
            {branding?.logo_url ? (
              <img src={branding.logo_url} alt={branding.app_name} className="h-full w-full object-contain" />
            ) : (
              <Wallet className="h-5 w-5 text-sidebar-foreground" />
            )}
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">{branding?.app_name ?? "CrediFlow"}</h1>
            <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">
              {branding?.login_tagline ?? "Crédito inteligente"}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-auto">
        {items.filter((i) => !i.admin || role === "admin").map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
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
          onClick={toggle}
        >
          {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
          {theme === "dark" ? "Modo claro" : "Modo escuro"}
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={async () => { onNavigate?.(); await signOut(); nav("/login"); }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        <SidebarContent />
      </aside>

      {/* Sidebar mobile (drawer) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar text-sidebar-foreground border-sidebar-border">
          <div className="flex h-full flex-col">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header mobile */}
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            {branding?.logo_url ? (
              <img src={branding.logo_url} alt={branding.app_name} className="h-7 w-7 rounded object-contain" />
            ) : (
              <Wallet className="h-5 w-5" />
            )}
            <span className="font-semibold">{branding?.app_name ?? "CrediFlow"}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema">
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
