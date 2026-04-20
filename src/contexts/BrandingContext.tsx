import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Branding {
  id: string;
  app_name: string;
  logo_url: string | null;
  background: string;
  foreground: string;
  primary_color: string;
  primary_foreground: string;
  secondary: string;
  secondary_foreground: string;
  accent: string;
  accent_foreground: string;
  muted: string;
  muted_foreground: string;
  card: string;
  card_foreground: string;
  border: string;
  sidebar_background: string;
  sidebar_foreground: string;
  sidebar_accent: string;
  sidebar_accent_foreground: string;
  sidebar_border: string;
  destructive: string;
  destructive_foreground: string;
  success: string;
  success_foreground: string;
  warning: string;
  warning_foreground: string;
}

// Mapeamento campo da tabela -> nome da CSS var
export const COLOR_FIELDS: { key: keyof Branding; cssVar: string; label: string; group: string }[] = [
  { key: "background", cssVar: "--background", label: "Fundo", group: "Cores base" },
  { key: "foreground", cssVar: "--foreground", label: "Texto", group: "Cores base" },
  { key: "card", cssVar: "--card", label: "Card", group: "Cores base" },

  { key: "primary_color", cssVar: "--primary", label: "Botão primário", group: "Botões" },
  { key: "primary_foreground", cssVar: "--primary-foreground", label: "Texto do primário", group: "Botões" },
  { key: "secondary", cssVar: "--secondary", label: "Botão secundário", group: "Botões" },
  { key: "secondary_foreground", cssVar: "--secondary-foreground", label: "Texto do secundário", group: "Botões" },
  { key: "accent", cssVar: "--accent", label: "Botão destaque", group: "Botões" },
  { key: "accent_foreground", cssVar: "--accent-foreground", label: "Texto do destaque", group: "Botões" },
  { key: "destructive", cssVar: "--destructive", label: "Botão perigo", group: "Botões" },
  { key: "destructive_foreground", cssVar: "--destructive-foreground", label: "Texto do perigo", group: "Botões" },

  { key: "sidebar_background", cssVar: "--sidebar-background", label: "Fundo da sidebar", group: "Menu lateral" },
  { key: "sidebar_foreground", cssVar: "--sidebar-foreground", label: "Texto da sidebar", group: "Menu lateral" },
  { key: "sidebar_accent", cssVar: "--sidebar-accent", label: "Item ativo", group: "Menu lateral" },
  { key: "sidebar_accent_foreground", cssVar: "--sidebar-accent-foreground", label: "Texto do item ativo", group: "Menu lateral" },
  { key: "sidebar_border", cssVar: "--sidebar-border", label: "Borda", group: "Menu lateral" },
];

// ---------- Conversores HEX <-> HSL ----------
export function hslStringToHex(hslStr: string): string {
  const m = hslStr.trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!m) return "#000000";
  const h = parseFloat(m[1]) / 360;
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) r = g = b = l;
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToHslString(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "0 0% 0%";
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// ---------- Aplicar tema ao DOM ----------
function applyTheme(b: Branding) {
  const root = document.documentElement;
  for (const f of COLOR_FIELDS) {
    const value = b[f.key] as string;
    if (value) root.style.setProperty(f.cssVar, value);
  }
  // Favicon
  if (b.logo_url) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = b.logo_url;
  }
  // Title
  if (b.app_name) document.title = b.app_name;
}

interface BrandingCtx {
  branding: Branding | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<BrandingCtx>({ branding: null, loading: true, refresh: async () => {} });

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("branding").select("*").limit(1).maybeSingle();
    if (data) {
      setBranding(data as Branding);
      applyTheme(data as Branding);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return <Ctx.Provider value={{ branding, loading, refresh }}>{children}</Ctx.Provider>;
}

export const useBranding = () => useContext(Ctx);
