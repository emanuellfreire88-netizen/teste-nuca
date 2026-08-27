"use client";

import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, FileDown } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  Document, Template, DocConfig, DOCUMENT_TYPES,
  getTypeLabel, SubpageKey,
} from "./shared";
import { RichTextEditor } from "./rich-text-editor";

interface NewDocumentSubpageProps {
  editingDoc?: Document | null;
  formMode: "create" | "edit";
  onNavigate: (key: SubpageKey) => void;
  onViewDocument: (docId: string) => void;
}

const emptyFormData = {
  document_type: "",
  recipient: "",
  recipient_title: "",
  recipient_treatment: "",
  institution: "",
  subject: "",
  vocative: "",
  date: format(new Date(), "yyyy-MM-dd"),
  internal_notes: "",
  template_id: "",
  body_text: "",
  closing: "",
  city: "",
  sender_name: "",
  sender_title: "",
  signature1_name: "",
  signature1_title: "",
  signature2_name: "",
  signature2_title: "",
  signature3_name: "",
  signature3_title: "",
};

export function NewDocumentSubpage({ editingDoc, formMode, onNavigate, onViewDocument }: NewDocumentSubpageProps) {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [configs, setConfigs] = useState<DocConfig[]>([]);

  // Initialize form data from props (component re-mounts on tab switch due to lazy loading)
  const initialFormData = useMemo(() => {
    if (formMode === "edit" && editingDoc) {
      return {
        document_type: editingDoc.document_type,
        recipient: editingDoc.recipient || "",
        recipient_title: editingDoc.recipient_title || "",
        recipient_treatment: editingDoc.recipient_treatment || "",
        institution: editingDoc.institution || "",
        subject: editingDoc.subject || "",
        vocative: editingDoc.vocative || "",
        date: editingDoc.date ? format(parseISO(editingDoc.date), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
        internal_notes: editingDoc.internal_notes || "",
        template_id: editingDoc.template_id || "",
        body_text: editingDoc.body_text || "",
        closing: editingDoc.closing || "",
        city: editingDoc.city || "",
        sender_name: editingDoc.sender_name || "",
        sender_title: editingDoc.sender_title || "",
        signature1_name: editingDoc.signature1_name || "",
        signature1_title: editingDoc.signature1_title || "",
        signature2_name: editingDoc.signature2_name || "",
        signature2_title: editingDoc.signature2_title || "",
        signature3_name: editingDoc.signature3_name || "",
        signature3_title: editingDoc.signature3_title || "",
      };
    }
    return emptyFormData;
  }, [formMode, editingDoc]);

  const [formData, setFormData] = useState(initialFormData);
  const [showSig2, setShowSig2] = useState(formMode === "edit" && editingDoc ? !!editingDoc.signature2_name : false);
  const [showSig3, setShowSig3] = useState(formMode === "edit" && editingDoc ? !!editingDoc.signature3_name : false);

  // Fetch templates & configs on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tData = await api.get<{ templates: Template[] }>("/documents/templates");
        if (!cancelled) setTemplates(tData.templates);
      } catch { if (!cancelled) toast.error("Erro ao carregar modelos"); }
      try {
        const cData = await api.get<{ configs: DocConfig[] }>("/documents/config");
        if (!cancelled) setConfigs(cData.configs);
      } catch { /* configs not critical */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const getConfigValue = (key: string): string => {
    const config = configs.find((c) => c.config_key === key);
    return config?.config_value || "";
  };

  const filteredTemplates = templates.filter(
    (t) => t.is_active && (!t.document_type || t.document_type === formData.document_type)
  );

  const handleTemplateSelect = (templateId: string) => {
    const effectiveId = templateId === "__none__" ? "" : templateId;
    setFormData((prev) => ({ ...prev, template_id: effectiveId }));
    if (!effectiveId) return;
    const template = templates.find((t) => t.id === effectiveId);
    if (template) {
      if (template.body_text) setFormData((prev) => ({ ...prev, body_text: template.body_text! }));
      if (template.signature1_name) setFormData((prev) => ({ ...prev, signature1_name: template.signature1_name!, signature1_title: template.signature1_title || "" }));
      if (template.signature2_name) { setShowSig2(true); setFormData((prev) => ({ ...prev, signature2_name: template.signature2_name!, signature2_title: template.signature2_title || "" })); }
      if (template.signature3_name) { setShowSig3(true); setFormData((prev) => ({ ...prev, signature3_name: template.signature3_name!, signature3_title: template.signature3_title || "" })); }
    }
  };

  const handleCreateDocument = async (status: string = "draft") => {
    if (!formData.document_type) { toast.error("Selecione o tipo de documento"); return; }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        document_type: formData.document_type, recipient: formData.recipient,
        recipient_title: formData.recipient_title,
        recipient_treatment: formData.recipient_treatment || undefined,
        institution: formData.institution,
        subject: formData.subject,
        vocative: formData.vocative || undefined,
        closing: formData.closing || undefined,
        city: formData.city || undefined,
        sender_name: formData.sender_name || undefined,
        sender_title: formData.sender_title || undefined,
        date: formData.date, internal_notes: formData.internal_notes,
        body_text: formData.body_text, template_id: formData.template_id || undefined, status,
        signature1_name: formData.signature1_name, signature1_title: formData.signature1_title,
        signature2_name: showSig2 ? formData.signature2_name : null,
        signature2_title: showSig2 ? formData.signature2_title : null,
        signature3_name: showSig3 ? formData.signature3_name : null,
        signature3_title: showSig3 ? formData.signature3_title : null,
      };
      const result = await api.post<{ document: Document }>("/documents", body);
      toast.success(`Documento criado! ${result.document.number_formatted} — Protocolo: ${result.document.protocol}`, { duration: 5000 });
      setFormData(emptyFormData); setShowSig2(false); setShowSig3(false);
      if (status === "generated") onViewDocument(result.document.id);
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Erro ao criar documento"); }
    setLoading(false);
  };

  const handleUpdateDocument = async () => {
    if (!editingDoc) return;
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        recipient: formData.recipient, recipient_title: formData.recipient_title,
        recipient_treatment: formData.recipient_treatment || undefined,
        institution: formData.institution, subject: formData.subject,
        vocative: formData.vocative || undefined,
        closing: formData.closing || undefined,
        city: formData.city || undefined,
        sender_name: formData.sender_name || undefined,
        sender_title: formData.sender_title || undefined,
        date: formData.date,
        internal_notes: formData.internal_notes, body_text: formData.body_text,
        template_id: formData.template_id || undefined,
        signature1_name: formData.signature1_name, signature1_title: formData.signature1_title,
        signature2_name: showSig2 ? formData.signature2_name : null,
        signature2_title: showSig2 ? formData.signature2_title : null,
        signature3_name: showSig3 ? formData.signature3_name : null,
        signature3_title: showSig3 ? formData.signature3_title : null,
      };
      await api.put(`/documents/${editingDoc.id}`, body);
      toast.success("Documento atualizado com sucesso!");
      onNavigate("list");
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Erro ao atualizar documento"); }
    setLoading(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">{formMode === "edit" ? "Editar Documento" : "Novo Documento"}</h1>
        <p className="text-muted-foreground mt-1">
          {formMode === "edit" ? `Editando: ${editingDoc?.number_formatted || editingDoc?.id}` : "Crie um novo documento oficial"}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left panel - Form */}
        <div className="lg:col-span-3 space-y-4">
          {/* Type & Template */}
          <Card><CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo do Documento *</Label>
                {formMode === "edit" ? (
                  <Input value={getTypeLabel(formData.document_type)} disabled className="bg-muted" />
                ) : (
                  <Select value={formData.document_type} onValueChange={(v) => setFormData((prev) => ({ ...prev, document_type: v, template_id: "" }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione o tipo..." /></SelectTrigger>
                    <SelectContent>{DOCUMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label>Modelo (opcional)</Label>
                <Select value={formData.template_id} onValueChange={handleTemplateSelect}>
                  <SelectTrigger><SelectValue placeholder="Sem modelo..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem modelo</SelectItem>
                    {filteredTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.display_name}{t.is_default ? " (Padrão)" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent></Card>

          {/* Recipient & Sender */}
          <Card><CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Destinatário</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tratamento</Label>
                <Input value={formData.recipient_treatment} onChange={(e) => setFormData((prev) => ({ ...prev, recipient_treatment: e.target.value }))} placeholder="Ex: Excelentíssima Senhora," />
              </div>
              <div className="space-y-2">
                <Label>Nome do Destinatário</Label>
                <Input value={formData.recipient} onChange={(e) => setFormData((prev) => ({ ...prev, recipient: e.target.value }))} placeholder="Nome do destinatário" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Cargo</Label><Input value={formData.recipient_title} onChange={(e) => setFormData((prev) => ({ ...prev, recipient_title: e.target.value }))} placeholder="Cargo/função" /></div>
              <div className="space-y-2"><Label>Instituição</Label><Input value={formData.institution} onChange={(e) => setFormData((prev) => ({ ...prev, institution: e.target.value }))} placeholder="Nome da instituição" /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Assunto</Label><Input value={formData.subject} onChange={(e) => setFormData((prev) => ({ ...prev, subject: e.target.value }))} placeholder="Assunto (aparece em negrito)" /></div>
              <div className="space-y-2"><Label>Vocativo</Label><Input value={formData.vocative} onChange={(e) => setFormData((prev) => ({ ...prev, vocative: e.target.value }))} placeholder="Ex: Prezada Secretária," /></div>
            </div>

            <h3 className="text-sm font-semibold text-muted-foreground pt-2">Remetente & Local</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nome do Remetente</Label><Input value={formData.sender_name} onChange={(e) => setFormData((prev) => ({ ...prev, sender_name: e.target.value }))} placeholder="Ex: JEFERSON SILVA SOUZA (aparece em maiúsculas)" /></div>
              <div className="space-y-2"><Label>Cargo do Remetente</Label><Input value={formData.sender_title} onChange={(e) => setFormData((prev) => ({ ...prev, sender_title: e.target.value }))} placeholder="Ex: Mobilizador do Nuca" /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Cidade (opcional)</Label><Input value={formData.city} onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))} placeholder="Ex: Limoeiro de Anadia (vazio = usa config global)" /></div>
              <div className="space-y-2"><Label>Fechamento</Label><Input value={formData.closing} onChange={(e) => setFormData((prev) => ({ ...prev, closing: e.target.value }))} placeholder="Ex: Atenciosamente," /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Data</Label><Input type="date" value={formData.date} onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Observações Internas</Label><Textarea value={formData.internal_notes} onChange={(e) => setFormData((prev) => ({ ...prev, internal_notes: e.target.value }))} placeholder="Notas internas" rows={2} /></div>
          </CardContent></Card>

          {/* Rich Text Editor */}
          <Card><CardContent className="p-4 space-y-2">
            <Label>Conteúdo do Documento</Label>
            <RichTextEditor content={formData.body_text} onChange={(html) => setFormData((prev) => ({ ...prev, body_text: html }))} placeholder="Digite o conteúdo..." />
          </CardContent></Card>

          {/* Signatures */}
          <Card><CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-semibold">Assinaturas</h3>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Assinatura 1 (Obrigatória)</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input value={formData.signature1_name} onChange={(e) => setFormData((prev) => ({ ...prev, signature1_name: e.target.value }))} placeholder="Nome" />
                <Input value={formData.signature1_title} onChange={(e) => setFormData((prev) => ({ ...prev, signature1_title: e.target.value }))} placeholder="Cargo" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2"><Switch checked={showSig2} onCheckedChange={setShowSig2} /><Label className="text-xs text-muted-foreground">Adicionar Assinatura 2</Label></div>
              {showSig2 && <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input value={formData.signature2_name} onChange={(e) => setFormData((prev) => ({ ...prev, signature2_name: e.target.value }))} placeholder="Nome" />
                <Input value={formData.signature2_title} onChange={(e) => setFormData((prev) => ({ ...prev, signature2_title: e.target.value }))} placeholder="Cargo" />
              </div>}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2"><Switch checked={showSig3} onCheckedChange={setShowSig3} /><Label className="text-xs text-muted-foreground">Adicionar Assinatura 3</Label></div>
              {showSig3 && <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input value={formData.signature3_name} onChange={(e) => setFormData((prev) => ({ ...prev, signature3_name: e.target.value }))} placeholder="Nome" />
                <Input value={formData.signature3_title} onChange={(e) => setFormData((prev) => ({ ...prev, signature3_title: e.target.value }))} placeholder="Cargo" />
              </div>}
            </div>
          </CardContent></Card>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {formMode === "create" ? (
              <>
                <Button onClick={() => handleCreateDocument("draft")} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Salvar Rascunho
                </Button>
                <Button variant="secondary" onClick={() => handleCreateDocument("generated")} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileDown className="h-4 w-4 mr-1" />}Gerar Documento
                </Button>
              </>
            ) : (
              <>
                <Button onClick={handleUpdateDocument} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Atualizar
                </Button>
                <Button variant="outline" onClick={() => onNavigate("list")}>Cancelar</Button>
              </>
            )}
          </div>
        </div>

        {/* Right panel - Preview */}
        <div className="lg:col-span-2">
          <Card className="sticky top-4">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Pré-visualização</CardTitle></CardHeader>
            <CardContent className="p-4">
              <div className="bg-white dark:bg-gray-950 border rounded-md p-6 min-h-[300px] max-h-[800px] overflow-y-auto shadow-sm">
                <div className="text-center border-b pb-4 mb-4">
                  <p className="text-sm font-bold">{getConfigValue("prefeitura_name") || "Prefeitura Municipal"}</p>
                  <p className="text-xs">{getConfigValue("nuca_name") || "NUCA"}</p>
                </div>
                <div className="text-center mb-2">
                  <p className="text-sm font-semibold">{formData.document_type ? getTypeLabel(formData.document_type) : "Documento"}</p>
                </div>
                {formData.recipient && <div className="mb-4 text-sm">
                  <p className="font-medium">{formData.recipient}</p>
                  {formData.recipient_title && <p className="text-xs text-muted-foreground">{formData.recipient_title}</p>}
                  {formData.institution && <p className="text-xs text-muted-foreground">{formData.institution}</p>}
                </div>}
                {formData.subject && <div className="mb-2 text-sm"><p><strong>Assunto:</strong> {formData.subject}</p></div>}
                <div className="border-b my-4" />
                {formData.body_text ? <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: sanitizeHtml(formData.body_text) }} /> : <p className="text-sm text-muted-foreground italic">Conteúdo do documento...</p>}
                <div className="mt-8 grid grid-cols-2 gap-8">
                  {formData.signature1_name && <div className="text-center"><div className="border-t pt-2 mt-6"><p className="text-sm font-medium">{formData.signature1_name}</p>{formData.signature1_title && <p className="text-xs">{formData.signature1_title}</p>}</div></div>}
                  {showSig2 && formData.signature2_name && <div className="text-center"><div className="border-t pt-2 mt-6"><p className="text-sm font-medium">{formData.signature2_name}</p>{formData.signature2_title && <p className="text-xs">{formData.signature2_title}</p>}</div></div>}
                  {showSig3 && formData.signature3_name && <div className="text-center"><div className="border-t pt-2 mt-6"><p className="text-sm font-medium">{formData.signature3_name}</p>{formData.signature3_title && <p className="text-xs">{formData.signature3_title}</p>}</div></div>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
