import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Upload, RotateCcw } from "lucide-react";
import {
  useBranding, COLOR_FIELDS, hslStringToHex, hexToHslString, type Branding,
} from "@/contexts/BrandingContext";

export function BrandingTab() {
  const { branding, refresh } = useBranding();
  const [draft, setDraft] = useState<Branding | null>(branding);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (branding) setDraft(branding); }, [branding]);

  if (!draft) return <Loader2 className="h-6 w-6 animate-spin" />;

  const setField = <K extends keyof Branding>(k: K, v: Branding[K]) =>
    setDraft({ ...draft, [k]: v });

  // Pré-visualização ao vivo
  const onColorChange = (key: keyof Branding, hex: string) => {
    const hsl = hexToHslString(hex);
    setField(key, hsl as Branding[typeof key]);
    const cssVar = COLOR_FIELDS.find((f) => f.key === key)?.cssVar;
    if (cssVar) document.documentElement.style.setProperty(cssVar, hsl);
  };

  const onHslTextChange = (key: keyof Branding, hslText: string) => {
    setField(key, hslText as Branding[typeof key]);
    const cssVar = COLOR_FIELDS.find((f) => f.key === key)?.cssVar;
    if (cssVar) document.documentElement.style.setProperty(cssVar, hslText);
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("branding").upload(path, file, {
      cacheControl: "3600", upsert: true, contentType: file.type,
    });
    if (upErr) {
      setUploading(false);
      toast.error("Erro no upload", { description: upErr.message });
      return;
    }
    const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
    setField("logo_url", pub.publicUrl);
    setUploading(false);
    toast.success("Logo carregada — clique em Salvar para aplicar");
  };

  const save = async () => {
    setSaving(true);
    const { id, ...payload } = draft;
    const { error } = await supabase.from("branding").update(payload).eq("id", id);
    setSaving(false);
    if (error) return toast.error("Erro ao salvar", { description: error.message });
    toast.success("Marca atualizada");
    await refresh();
  };

  const resetPreview = async () => {
    await refresh();
    toast.info("Pré-visualização restaurada");
  };

  // Agrupa cores
  const groups = COLOR_FIELDS.reduce<Record<string, typeof COLOR_FIELDS>>((acc, f) => {
    (acc[f.group] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Identidade */}
      <Card className="shadow-card">
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Identidade</h2>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] items-end">
            <div className="space-y-2">
              <Label>Nome do aplicativo</Label>
              <Input
                value={draft.app_name}
                onChange={(e) => setField("app_name", e.target.value)}
                maxLength={50}
              />
            </div>
            <div className="flex items-center gap-3">
              {draft.logo_url ? (
                <img src={draft.logo_url} alt="Logo" className="h-12 w-12 rounded-lg object-contain bg-muted p-1" />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-muted" />
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 2 * 1024 * 1024) return toast.error("Arquivo > 2MB");
                    uploadLogo(f);
                  }
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Trocar logo
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Recomendado: PNG ou SVG quadrado, até 2MB. A mesma imagem aparece na sidebar e como ícone do navegador.
          </p>
        </CardContent>
      </Card>

      {/* Cores */}
      {Object.entries(groups).map(([group, fields]) => (
        <Card key={group} className="shadow-card">
          <CardContent className="p-6 space-y-4">
            <h2 className="text-lg font-semibold">{group}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((f) => {
                const value = draft[f.key] as string;
                const hex = hslStringToHex(value);
                return (
                  <div key={f.key} className="space-y-2">
                    <Label className="text-xs">{f.label}</Label>
                    <div className="flex items-center gap-2">
                      <label
                        className="relative h-10 w-10 shrink-0 cursor-pointer rounded-md border border-border overflow-hidden"
                        style={{ backgroundColor: hex }}
                        title="Clique para escolher uma cor"
                      >
                        <input
                          type="color"
                          value={hex}
                          onChange={(e) => onColorChange(f.key, e.target.value)}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        />
                      </label>
                      <Input
                        value={hex}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (/^#[0-9a-fA-F]{6}$/.test(v)) onColorChange(f.key, v);
                          else setField(f.key, value as Branding[typeof f.key]);
                        }}
                        className="font-mono text-sm uppercase"
                        placeholder="#000000"
                      />
                    </div>
                    <Input
                      value={value}
                      onChange={(e) => onHslTextChange(f.key, e.target.value)}
                      className="font-mono text-[10px] text-muted-foreground h-7"
                      placeholder="0 0% 0%"
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={resetPreview}>
          <RotateCcw className="mr-2 h-4 w-4" />Descartar
        </Button>
        <Button onClick={save} disabled={saving} size="lg" className="bg-gradient-primary">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar marca"}
        </Button>
      </div>
    </div>
  );
}
