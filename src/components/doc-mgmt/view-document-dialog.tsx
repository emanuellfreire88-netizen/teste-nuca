"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Pencil, Download, ArrowRight, Upload, Trash2, Paperclip, History, Loader2,
} from "lucide-react";
import {
  Document, STATUS_ALLOWED_TRANSITIONS,
  getTypeLabel, getStatusInfo, formatDateBR, formatDateLongBR, formatFileSize, StatusBadge,
} from "./shared";

interface ViewDocumentDialogProps {
  viewingDoc: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditDocument: (doc: Document) => void;
  onDownloadPdf: (docId: string, docNumber: string) => void;
  onStatusChangeRequest: (docId: string, newStatus: string) => void;
}

export function ViewDocumentDialog({
  viewingDoc, open, onOpenChange, onEditDocument, onDownloadPdf, onStatusChangeRequest,
}: ViewDocumentDialogProps) {
  const [newStatus, setNewStatus] = useState("");
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [localDoc, setLocalDoc] = useState<Document | null>(null);
  const attachmentFileRef = useRef<HTMLInputElement>(null);

  // Use localDoc if available (after attachment changes), otherwise viewingDoc
  const displayDoc = localDoc || viewingDoc;

  // Reset localDoc whenever the parent switches to a different document,
  // so stale attachment state from a previous document doesn't leak in.
  useEffect(() => {
    setLocalDoc(null);
    setNewStatus("");
  }, [viewingDoc?.id]);

  const handleUploadAttachment = async (docId: string, file: File) => {
    setUploadingAttachment(true);
    try {
      await api.upload(`/documents/${docId}/attachments`, file);
      toast.success(`Anexo "${file.name}" adicionado!`);
      const data = await api.get<{ document: Document }>(`/documents/${docId}`);
      setLocalDoc(data.document);
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Erro ao adicionar anexo"); }
    setUploadingAttachment(false);
  };

  const handleDeleteAttachment = async (docId: string, attachmentId: string) => {
    try {
      await api.delete(`/documents/${docId}/attachments?attachment_id=${attachmentId}`);
      toast.success("Anexo removido!");
      const data = await api.get<{ document: Document }>(`/documents/${docId}`);
      setLocalDoc(data.document);
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Erro ao remover anexo"); }
  };

  // Reset local state when dialog closes or doc changes
  const handleClose = (isOpen: boolean) => {
    if (!isOpen) { setLocalDoc(null); setNewStatus(""); }
    onOpenChange(isOpen);
  };

  if (!displayDoc) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{displayDoc.number_formatted || "Documento"}</DialogTitle>
          <DialogDescription>
            Protocolo: {displayDoc.protocol} — {getTypeLabel(displayDoc.document_type)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Metadata */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><p className="text-xs text-muted-foreground">Tipo</p><p className="text-sm font-medium">{getTypeLabel(displayDoc.document_type)}</p></div>
            <div><p className="text-xs text-muted-foreground">Data</p><p className="text-sm font-medium">{formatDateLongBR(displayDoc.date)}</p></div>
            <div><p className="text-xs text-muted-foreground">Status</p><StatusBadge status={displayDoc.status} /></div>
            {displayDoc.recipient && <div><p className="text-xs text-muted-foreground">Destinatário</p><p className="text-sm font-medium">{displayDoc.recipient}</p></div>}
            {displayDoc.recipient_title && <div><p className="text-xs text-muted-foreground">Cargo</p><p className="text-sm">{displayDoc.recipient_title}</p></div>}
            {displayDoc.institution && <div><p className="text-xs text-muted-foreground">Instituição</p><p className="text-sm">{displayDoc.institution}</p></div>}
            {displayDoc.subject && <div className="col-span-2 md:col-span-3"><p className="text-xs text-muted-foreground">Assunto</p><p className="text-sm font-medium">{displayDoc.subject}</p></div>}
            <div><p className="text-xs text-muted-foreground">Criado por</p><p className="text-sm">{displayDoc.creator?.full_name || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Criado em</p><p className="text-sm">{formatDateBR(displayDoc.created_at)}</p></div>
            {displayDoc.template && <div><p className="text-xs text-muted-foreground">Modelo</p><p className="text-sm">{displayDoc.template.display_name}</p></div>}
          </div>

          {displayDoc.internal_notes && (
            <div className="bg-muted/50 rounded-md p-3"><p className="text-xs text-muted-foreground mb-1">Observações Internas</p><p className="text-sm">{displayDoc.internal_notes}</p></div>
          )}

          <Separator />

          {/* Rendered Body */}
          <div className="bg-white dark:bg-gray-950 border rounded-md p-6">
            {displayDoc.body_text ? (
              <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: displayDoc.body_text }} />
            ) : <p className="text-muted-foreground italic">Documento sem conteúdo</p>}
          </div>

          {/* Signatures */}
          {(displayDoc.signature1_name || displayDoc.signature2_name || displayDoc.signature3_name) && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold mb-3">Assinaturas</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {displayDoc.signature1_name && <div className="text-center"><div className="border-t pt-2 mt-4"><p className="text-sm font-medium">{displayDoc.signature1_name}</p>{displayDoc.signature1_title && <p className="text-xs text-muted-foreground">{displayDoc.signature1_title}</p>}</div></div>}
                {displayDoc.signature2_name && <div className="text-center"><div className="border-t pt-2 mt-4"><p className="text-sm font-medium">{displayDoc.signature2_name}</p>{displayDoc.signature2_title && <p className="text-xs text-muted-foreground">{displayDoc.signature2_title}</p>}</div></div>}
                {displayDoc.signature3_name && <div className="text-center"><div className="border-t pt-2 mt-4"><p className="text-sm font-medium">{displayDoc.signature3_name}</p>{displayDoc.signature3_title && <p className="text-xs text-muted-foreground">{displayDoc.signature3_title}</p>}</div></div>}
              </div>
            </div>
          )}

          {/* Status Change */}
          <div className="flex items-center gap-2">
            <Label className="text-xs">Alterar Status:</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v)}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {(STATUS_ALLOWED_TRANSITIONS[displayDoc.status] || []).map((s) => <SelectItem key={s} value={s}>{getStatusInfo(s).label}</SelectItem>)}
                {displayDoc.status !== "cancelled" && <SelectItem value="cancelled">{getStatusInfo("cancelled").label}</SelectItem>}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => { if (newStatus) onStatusChangeRequest(displayDoc.id, newStatus); }} disabled={!newStatus}>
              <ArrowRight className="h-4 w-4 mr-1" /> Alterar
            </Button>
          </div>

          {/* Attachments */}
          {displayDoc.attachments && displayDoc.attachments.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Anexos</h3>
              <div className="space-y-2">
                {displayDoc.attachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between bg-muted/50 rounded-md p-2">
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      <div><p className="text-sm font-medium">{att.file_name}</p><p className="text-xs text-muted-foreground">{formatFileSize(att.file_size)} — {formatDateBR(att.uploaded_at)}</p></div>
                    </div>
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDeleteAttachment(displayDoc.id, att.id)} title="Remover anexo" aria-label={`Remover anexo ${att.file_name}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload new attachment */}
          <div className="flex items-center gap-2">
            <input ref={attachmentFileRef} type="file" className="hidden" onChange={(e) => {
              if (e.target.files?.[0] && displayDoc) { handleUploadAttachment(displayDoc.id, e.target.files[0]); e.target.value = ""; }
            }} />
            <Button variant="outline" size="sm" onClick={() => attachmentFileRef.current?.click()} disabled={uploadingAttachment}>
              {uploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}Adicionar Anexo
            </Button>
          </div>

          {/* History Timeline */}
          {displayDoc.history && displayDoc.history.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Histórico</h3>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {displayDoc.history.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2 text-sm">
                    <History className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">{entry.description || entry.action}</p>
                      <p className="text-xs text-muted-foreground">{entry.user?.full_name || "—"} — {formatDateBR(entry.created_at)}</p>
                      {entry.old_value && entry.new_value && <p className="text-xs text-muted-foreground">{getStatusInfo(entry.old_value).label} → {getStatusInfo(entry.new_value).label}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handleClose(false)}>Fechar</Button>
          <Button variant="secondary" onClick={() => { onEditDocument(displayDoc); handleClose(false); }}><Pencil className="h-4 w-4 mr-1" /> Editar</Button>
          <Button onClick={() => onDownloadPdf(displayDoc.id, displayDoc.number_formatted || displayDoc.protocol)}><Download className="h-4 w-4 mr-1" /> PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
