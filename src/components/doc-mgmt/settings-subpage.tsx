"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save } from "lucide-react";
import { DocConfig } from "./shared";

export function SettingsSubpage() {
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [configs, setConfigs] = useState<DocConfig[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{ configs: DocConfig[] }>("/documents/config");
        if (!cancelled) setConfigs(data.configs);
      } catch { if (!cancelled) toast.error("Erro ao carregar configurações"); }
      if (!cancelled) setSettingsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const getConfigValue = (key: string): string => {
    const config = configs.find((c) => c.config_key === key);
    return config?.config_value || "";
  };

  const setConfigValue = (key: string, value: string) => {
    setConfigs((prev) => prev.map((c) => c.config_key === key ? { ...c, config_value: value } : c));
  };

  const handleSaveConfigs = async () => {
    setSettingsLoading(true);
    try {
      const entries = configs.map((c) => ({ config_key: c.config_key, config_value: c.config_value || "" }));
      await api.put("/documents/config", { entries });
      toast.success("Configurações salvas com sucesso!");
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Erro ao salvar configurações"); }
    setSettingsLoading(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground mt-1">Configurações do módulo de gestão documental</p>
      </div>

      {settingsLoading && configs.length === 0 ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <Card><CardContent className="p-6 space-y-6">
          {/* Prefeitura Name */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Nome da Prefeitura</Label>
            <Input value={getConfigValue("prefeitura_name")} onChange={(e) => setConfigValue("prefeitura_name", e.target.value)} />
          </div>

          {/* NUCA Name */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Nome do NUCA</Label>
            <Input value={getConfigValue("nuca_name")} onChange={(e) => setConfigValue("nuca_name", e.target.value)} />
          </div>

          {/* Municipio */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Município</Label>
              <Input value={getConfigValue("municipio")} onChange={(e) => setConfigValue("municipio", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Estado</Label>
              <Input value={getConfigValue("estado")} onChange={(e) => setConfigValue("estado", e.target.value)} />
            </div>
          </div>

          <Separator />

          {/* Brasão URL */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">URL do Brasão</Label>
            <Input value={getConfigValue("brasao_url")} onChange={(e) => setConfigValue("brasao_url", e.target.value)} placeholder="https://..." />
            {getConfigValue("brasao_url") && (
              <div className="mt-2 border rounded-md p-2 bg-muted/30 max-w-[200px]">
                <img src={getConfigValue("brasao_url")} alt="Brasão" className="max-w-[180px] max-h-[80px] object-contain mx-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            )}
          </div>

          {/* Logo URL */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">URL da Logomarca</Label>
            <Input value={getConfigValue("logo_url")} onChange={(e) => setConfigValue("logo_url", e.target.value)} placeholder="/uploads/nuca-logo.png" />
            {getConfigValue("logo_url") && (
              <div className="mt-2 border rounded-md p-2 bg-muted/30 max-w-[200px]">
                <img src={getConfigValue("logo_url")} alt="Logo" className="max-w-[180px] max-h-[80px] object-contain mx-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            )}
          </div>

          <Separator />

          {/* Header HTML */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Cabeçalho HTML</Label>
            <Textarea value={getConfigValue("header_html")} onChange={(e) => setConfigValue("header_html", e.target.value)} rows={4} placeholder="<div>...</div>" />
            <div className="mt-2 border rounded-md p-3 bg-white dark:bg-gray-950">
              <div dangerouslySetInnerHTML={{ __html: getConfigValue("header_html") }} />
            </div>
          </div>

          {/* Footer HTML */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Rodapé HTML</Label>
            <Textarea value={getConfigValue("footer_html")} onChange={(e) => setConfigValue("footer_html", e.target.value)} rows={3} placeholder="<div>...</div>" />
            <div className="mt-2 border rounded-md p-3 bg-white dark:bg-gray-950">
              <div dangerouslySetInnerHTML={{ __html: getConfigValue("footer_html") }} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={handleSaveConfigs} disabled={settingsLoading}>
              {settingsLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Salvar Configurações
            </Button>
          </div>
        </CardContent></Card>
      )}
    </motion.div>
  );
}
