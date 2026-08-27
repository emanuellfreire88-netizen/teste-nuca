"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import {
  Document, SubpageKey, SUBPAGE_TABS, getStatusInfo,
} from "./doc-mgmt/shared";

// ─── Lazy-loaded subpage components ──────────────────────────────────────────

const DashboardSubpage = dynamic(() => import("./doc-mgmt/dashboard-subpage").then((m) => m.DashboardSubpage), { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> });
const NewDocumentSubpage = dynamic(() => import("./doc-mgmt/new-document-subpage").then((m) => m.NewDocumentSubpage), { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> });
const ListSubpage = dynamic(() => import("./doc-mgmt/list-subpage").then((m) => m.ListSubpage), { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> });
const TemplatesSubpage = dynamic(() => import("./doc-mgmt/templates-subpage").then((m) => m.TemplatesSubpage), { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> });
const ProtocolsSubpage = dynamic(() => import("./doc-mgmt/protocols-subpage").then((m) => m.ProtocolsSubpage), { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> });
const ReportsSubpage = dynamic(() => import("./doc-mgmt/reports-subpage").then((m) => m.ReportsSubpage), { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> });
const SettingsSubpage = dynamic(() => import("./doc-mgmt/settings-subpage").then((m) => m.SettingsSubpage), { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> });
const ViewDocumentDialog = dynamic(() => import("./doc-mgmt/view-document-dialog").then((m) => m.ViewDocumentDialog), { ssr: false });

// ─── Main Component ──────────────────────────────────────────────────────────

export function DocumentManagementPage() {
  const [activeSubpage, setActiveSubpage] = useState<SubpageKey>("dashboard");

  // ─── Shared state for cross-subpage communication ────────────────────────
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");

  // ─── View document dialog ────────────────────────────────────────────────
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  // ─── Status change dialog ────────────────────────────────────────────────
  const [statusChangeDialogOpen, setStatusChangeDialogOpen] = useState(false);
  const [statusChangeDocId, setStatusChangeDocId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [loading, setLoading] = useState(false);

  // ─── Delete confirm dialog ───────────────────────────────────────────────
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);

  // ─── Shared callbacks ────────────────────────────────────────────────────

  const openEditDocument = useCallback((doc: Document) => {
    setFormMode("edit");
    setEditingDoc(doc);
    setActiveSubpage("new");
  }, []);

  const openViewDocument = useCallback(async (docId: string) => {
    setLoading(true);
    try {
      const data = await api.get<{ document: Document }>(`/documents/${docId}`);
      setViewingDoc(data.document);
      setViewDialogOpen(true);
    } catch { toast.error("Erro ao carregar detalhes do documento"); }
    setLoading(false);
  }, []);

  const handleDownloadPdf = useCallback(async (docId: string, docNumber: string) => {
    try {
      await api.download(`/documents/${docId}/pdf`, `${docNumber || "documento"}.pdf`);
      toast.success("PDF gerado com sucesso!");
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Erro ao gerar PDF"); }
  }, []);

  const handleChangeStatus = useCallback(async () => {
    if (!statusChangeDocId || !newStatus) return;
    setLoading(true);
    try {
      await api.put(`/documents/${statusChangeDocId}/status`, { status: newStatus });
      toast.success(`Status alterado para ${getStatusInfo(newStatus).label}`);
      setStatusChangeDialogOpen(false); setStatusChangeDocId(null); setNewStatus("");
      // Refresh view dialog if open
      if (viewingDoc && viewingDoc.id === statusChangeDocId) {
        const data = await api.get<{ document: Document }>(`/documents/${statusChangeDocId}`);
        setViewingDoc(data.document);
      }
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Erro ao alterar status"); }
    setLoading(false);
  }, [statusChangeDocId, newStatus, viewingDoc]);

  const handleDeleteDocument = useCallback(async () => {
    if (!deleteDocId) return;
    setLoading(true);
    try {
      await api.delete(`/documents/${deleteDocId}`);
      toast.success("Documento excluído com sucesso!");
      setDeleteDialogOpen(false); setDeleteDocId(null);
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Erro ao excluir documento"); }
    setLoading(false);
  }, [deleteDocId]);

  const onStatusChangeRequest = useCallback((docId: string, status?: string) => {
    setStatusChangeDocId(docId);
    if (status) setNewStatus(status);
    else setNewStatus("");
    setStatusChangeDialogOpen(true);
  }, []);

  const onDeleteDocument = useCallback((docId: string) => {
    setDeleteDocId(docId);
    setDeleteDialogOpen(true);
  }, []);

  // ─── Sub-navigation ──────────────────────────────────────────────────────

  const renderSubNav = () => (
    <div className="flex items-center gap-1 border-b pb-1 mb-4 overflow-x-auto">
      {SUBPAGE_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeSubpage === tab.key;
        return (
          <Button
            key={tab.key}
            variant="ghost"
            size="sm"
            className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
              isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
            onClick={() => {
              setActiveSubpage(tab.key);
              if (tab.key === "new") { setFormMode("create"); setEditingDoc(null); }
            }}
          >
            <Icon className="h-4 w-4 mr-1" />
            {tab.label}
          </Button>
        );
      })}
    </div>
  );

  // ─── Main Render ─────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6">
      {renderSubNav()}

      <AnimatePresence mode="wait">
        {activeSubpage === "dashboard" && <DashboardSubpage onEditDocument={openEditDocument} onViewDocument={openViewDocument} onDownloadPdf={handleDownloadPdf} />}
        {activeSubpage === "new" && <NewDocumentSubpage editingDoc={editingDoc} formMode={formMode} onNavigate={setActiveSubpage} onViewDocument={openViewDocument} />}
        {activeSubpage === "list" && <ListSubpage onEditDocument={openEditDocument} onViewDocument={openViewDocument} onDownloadPdf={handleDownloadPdf} onDeleteDocument={onDeleteDocument} onStatusChangeRequest={(id) => onStatusChangeRequest(id)} onNavigate={setActiveSubpage} />}
        {activeSubpage === "templates" && <TemplatesSubpage />}
        {activeSubpage === "protocols" && <ProtocolsSubpage onViewDocument={openViewDocument} />}
        {activeSubpage === "reports" && <ReportsSubpage onNavigate={setActiveSubpage} />}
        {activeSubpage === "settings" && <SettingsSubpage />}
      </AnimatePresence>

      {/* View Document Dialog */}
      <ViewDocumentDialog
        viewingDoc={viewingDoc}
        open={viewDialogOpen}
        onOpenChange={(isOpen) => {
          setViewDialogOpen(isOpen);
          // Clear viewingDoc when the dialog closes so we don't keep a
          // stale document mounted (with its attachment data) in the background.
          if (!isOpen) setViewingDoc(null);
        }}
        onEditDocument={openEditDocument}
        onDownloadPdf={handleDownloadPdf}
        onStatusChangeRequest={(docId, status) => onStatusChangeRequest(docId, status)}
      />

      {/* Status Change Confirm Dialog */}
      <AlertDialog open={statusChangeDialogOpen} onOpenChange={setStatusChangeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar Status do Documento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja alterar o status para <strong>{getStatusInfo(newStatus).label}</strong>?
              Esta ação será registrada no histórico do documento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setStatusChangeDialogOpen(false); setNewStatus(""); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleChangeStatus}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Documento</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. O documento será excluído junto com seu histórico e anexos.
              Somente documentos em rascunho ou cancelados podem ser excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteDialogOpen(false); setDeleteDocId(null); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDocument} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
