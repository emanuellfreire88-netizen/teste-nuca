"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table as ShadcnTable, TableBody as ShadcnTableBody, TableCell as ShadcnTableCell,
  TableHead as ShadcnTableHead, TableHeader as ShadcnTableHeader, TableRow as ShadcnTableRow,
} from "@/components/ui/table";
import { Loader2, FileText, Plus, Pencil, Copy, Trash2, ChevronDown, CheckCircle2 } from "lucide-react";
import { Template, DOCUMENT_TYPES, getTypeLabel } from "./shared";

const emptyTemplateForm = {
  name: "", display_name: "", document_type: "", description: "",
  header_text: "", body_text: "", footer_text: "",
  signature1_name: "", signature1_title: "",
  signature2_name: "", signature2_title: "",
  signature3_name: "", signature3_title: "",
  is_default: false, is_active: true,
};

export function TemplatesSubpage() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [templateFormMode, setTemplateFormMode] = useState<"create" | "edit">("create");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateFormData, setTemplateFormData] = useState(emptyTemplateForm);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const data = await api.get<{ templates: Template[] }>("/documents/templates");
      setTemplates(data.templates);
    } catch { toast.error("Erro ao carregar modelos"); }
    setLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const resetTemplateForm = () => {
    setTemplateFormData(emptyTemplateForm);
    setEditingTemplateId(null);
    setTemplateFormMode("create");
  };

  const handleCreateTemplate = async () => {
    if (!templateFormData.name || !templateFormData.display_name) { toast.error("Nome e nome de exibição são obrigatórios"); return; }
    setLoading(true);
    try {
      await api.post("/documents/templates", { ...templateFormData });
      toast.success("Modelo criado com sucesso!");
      setTemplateFormOpen(false); resetTemplateForm(); fetchTemplates();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Erro ao criar modelo"); }
    setLoading(false);
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplateId) return;
    setLoading(true);
    try {
      await api.put("/documents/templates", { id: editingTemplateId, ...templateFormData });
      toast.success("Modelo atualizado com sucesso!");
      setTemplateFormOpen(false); resetTemplateForm(); fetchTemplates();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Erro ao atualizar modelo"); }
    setLoading(false);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    setLoading(true);
    try { await api.delete(`/documents/templates?id=${templateId}`); toast.success("Modelo removido!"); fetchTemplates();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Erro ao remover modelo"); }
    setLoading(false);
  };

  const handleSetDefaultTemplate = async (templateId: string) => {
    setLoading(true);
    try { await api.put("/documents/templates", { id: templateId, is_default: true }); toast.success("Modelo definido como padrão!"); fetchTemplates();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Erro ao definir modelo padrão"); }
    setLoading(false);
  };

  const openEditTemplate = (template: Template) => {
    setTemplateFormMode("edit"); setEditingTemplateId(template.id);
    setTemplateFormData({
      name: template.name, display_name: template.display_name,
      document_type: template.document_type || "", description: template.description || "",
      header_text: template.header_text || "", body_text: template.body_text || "",
      footer_text: template.footer_text || "",
      signature1_name: template.signature1_name || "", signature1_title: template.signature1_title || "",
      signature2_name: template.signature2_name || "", signature2_title: template.signature2_title || "",
      signature3_name: template.signature3_name || "", signature3_title: template.signature3_title || "",
      is_default: template.is_default, is_active: template.is_active,
    });
    setTemplateFormOpen(true);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Modelos de Documento</h1>
        <p className="text-muted-foreground mt-1">Gerencie os modelos/templates disponíveis para criação de documentos</p>
      </div>

      <div className="flex items-center justify-between">
        <Button onClick={() => { resetTemplateForm(); setTemplateFormOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Novo Modelo</Button>
        <div className="bg-muted/50 border rounded-md p-3 max-w-md">
          <p className="text-xs font-semibold mb-1">Variáveis disponíveis:</p>
          <p className="text-xs text-muted-foreground">{"{{numero_documento}}, {{protocolo}}, {{data}}, {{ano}}, {{destinatário}}, {{cargo_destinatário}}, {{instituição}}, {{município}}"}</p>
        </div>
      </div>

      {loading && templates.length === 0 ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : templates.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><FileText className="h-12 w-12 mx-auto mb-2 opacity-50" /><p>Nenhum modelo cadastrado</p></CardContent></Card>
      ) : (
        <Card><CardContent className="p-4">
          <div className="max-h-96 overflow-y-auto">
            <ShadcnTable>
              <ShadcnTableHeader>
                <ShadcnTableRow>
                  <ShadcnTableHead>Nome</ShadcnTableHead><ShadcnTableHead>Tipo</ShadcnTableHead>
                  <ShadcnTableHead>Descrição</ShadcnTableHead><ShadcnTableHead>Padrão</ShadcnTableHead>
                  <ShadcnTableHead>Ativo</ShadcnTableHead><ShadcnTableHead className="text-right">Ações</ShadcnTableHead>
                </ShadcnTableRow>
              </ShadcnTableHeader>
              <ShadcnTableBody>
                {templates.map((template) => (
                  <ShadcnTableRow key={template.id}>
                    <ShadcnTableCell className="font-medium">{template.display_name}</ShadcnTableCell>
                    <ShadcnTableCell className="text-sm">{template.document_type ? getTypeLabel(template.document_type) : "Genérico"}</ShadcnTableCell>
                    <ShadcnTableCell className="text-sm max-w-[200px] truncate">{template.description || "—"}</ShadcnTableCell>
                    <ShadcnTableCell>{template.is_default && <Badge className="bg-green-100 text-green-800 text-xs">Padrão</Badge>}</ShadcnTableCell>
                    <ShadcnTableCell><Badge className={template.is_active ? "bg-green-100 text-green-800 text-xs" : "bg-red-100 text-red-800 text-xs"}>{template.is_active ? "Ativo" : "Inativo"}</Badge></ShadcnTableCell>
                    <ShadcnTableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditTemplate(template)}><Pencil className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            resetTemplateForm();
                            setTemplateFormData({ ...emptyTemplateForm, name: template.name + "_copy", display_name: template.display_name + " (Cópia)",
                              document_type: template.document_type || "", description: template.description || "",
                              header_text: template.header_text || "", body_text: template.body_text || "", footer_text: template.footer_text || "",
                              signature1_name: template.signature1_name || "", signature1_title: template.signature1_title || "",
                              signature2_name: template.signature2_name || "", signature2_title: template.signature2_title || "",
                              signature3_name: template.signature3_name || "", signature3_title: template.signature3_title || "",
                              is_default: false, is_active: true });
                            setTemplateFormOpen(true);
                          }}><Copy className="h-4 w-4 mr-2" /> Duplicar</DropdownMenuItem>
                          {!template.is_default && <DropdownMenuItem onClick={() => handleSetDefaultTemplate(template.id)}><CheckCircle2 className="h-4 w-4 mr-2" /> Definir como Padrão</DropdownMenuItem>}
                          <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteTemplate(template.id)}><Trash2 className="h-4 w-4 mr-2" /> Excluir</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ShadcnTableCell>
                  </ShadcnTableRow>
                ))}
              </ShadcnTableBody>
            </ShadcnTable>
          </div>
        </CardContent></Card>
      )}

      {/* Template Form Dialog */}
      <Dialog open={templateFormOpen} onOpenChange={setTemplateFormOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{templateFormMode === "edit" ? "Editar Modelo" : "Novo Modelo"}</DialogTitle>
            <DialogDescription>{"Defina o conteúdo e as variáveis do modelo. Use {{numero_documento}}, {{protocolo}}, etc."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nome (identificador único) *</Label><Input value={templateFormData.name} onChange={(e) => setTemplateFormData((prev) => ({ ...prev, name: e.target.value }))} placeholder="ex: oficio_padrao" disabled={templateFormMode === "edit"} /></div>
              <div className="space-y-2"><Label>Nome de Exibição *</Label><Input value={templateFormData.display_name} onChange={(e) => setTemplateFormData((prev) => ({ ...prev, display_name: e.target.value }))} placeholder="ex: Ofício Padrão" /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Tipo do Documento</Label>
                <Select value={templateFormData.document_type} onValueChange={(v) => setTemplateFormData((prev) => ({ ...prev, document_type: v }))}>
                  <SelectTrigger><SelectValue placeholder="Genérico (todos)" /></SelectTrigger>
                  <SelectContent><SelectItem value="generic">Genérico (todos)</SelectItem>{DOCUMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex items-end"><div className="flex items-center gap-2"><Switch checked={templateFormData.is_default} onCheckedChange={(v) => setTemplateFormData((prev) => ({ ...prev, is_default: v }))} /><Label className="text-sm">Definir como Padrão</Label></div></div>
            </div>
            <div className="space-y-2"><Label>Descrição</Label><Textarea value={templateFormData.description} onChange={(e) => setTemplateFormData((prev) => ({ ...prev, description: e.target.value }))} placeholder="Descrição..." rows={2} /></div>
            <Separator />
            <div className="space-y-2"><Label>Cabeçalho HTML</Label><Textarea value={templateFormData.header_text} onChange={(e) => setTemplateFormData((prev) => ({ ...prev, header_text: e.target.value }))} placeholder="<div>...</div>" rows={3} /></div>
            <div className="space-y-2"><Label>Texto do Corpo (HTML)</Label><Textarea value={templateFormData.body_text} onChange={(e) => setTemplateFormData((prev) => ({ ...prev, body_text: e.target.value }))} placeholder="Conteúdo com variáveis..." rows={6} /></div>
            <div className="space-y-2"><Label>Rodapé HTML</Label><Textarea value={templateFormData.footer_text} onChange={(e) => setTemplateFormData((prev) => ({ ...prev, footer_text: e.target.value }))} placeholder="<div>...</div>" rows={3} /></div>
            <Separator />
            <h3 className="text-sm font-semibold">Assinaturas Padrão</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input value={templateFormData.signature1_name} onChange={(e) => setTemplateFormData((prev) => ({ ...prev, signature1_name: e.target.value }))} placeholder="Assinatura 1 — Nome" />
              <Input value={templateFormData.signature1_title} onChange={(e) => setTemplateFormData((prev) => ({ ...prev, signature1_title: e.target.value }))} placeholder="Cargo" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input value={templateFormData.signature2_name} onChange={(e) => setTemplateFormData((prev) => ({ ...prev, signature2_name: e.target.value }))} placeholder="Assinatura 2 — Nome" />
              <Input value={templateFormData.signature2_title} onChange={(e) => setTemplateFormData((prev) => ({ ...prev, signature2_title: e.target.value }))} placeholder="Cargo" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input value={templateFormData.signature3_name} onChange={(e) => setTemplateFormData((prev) => ({ ...prev, signature3_name: e.target.value }))} placeholder="Assinatura 3 — Nome" />
              <Input value={templateFormData.signature3_title} onChange={(e) => setTemplateFormData((prev) => ({ ...prev, signature3_title: e.target.value }))} placeholder="Cargo" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateFormOpen(false)}>Cancelar</Button>
            <Button onClick={templateFormMode === "edit" ? handleUpdateTemplate : handleCreateTemplate} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}{templateFormMode === "edit" ? "Atualizar" : "Criar Modelo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
