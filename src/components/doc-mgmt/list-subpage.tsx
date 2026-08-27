"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table as ShadcnTable, TableBody as ShadcnTableBody, TableCell as ShadcnTableCell,
  TableHead as ShadcnTableHead, TableHeader as ShadcnTableHeader, TableRow as ShadcnTableRow,
} from "@/components/ui/table";
import {
  Loader2, FolderOpen, Search, Eye, Pencil, Download, Copy, Trash2, ArrowRight, ChevronLeft, ChevronRight, ChevronDown,
} from "lucide-react";
import {
  Document, Pagination, DOCUMENT_TYPES, DOCUMENT_STATUS, SubpageKey,
  getTypeLabel, formatDateBR, StatusBadge, getStatusInfo,
} from "./shared";

interface ListSubpageProps {
  onEditDocument: (doc: Document) => void;
  onViewDocument: (docId: string) => void;
  onDownloadPdf: (docId: string, docNumber: string) => void;
  onDuplicateDocument?: (docId: string) => void;
  onDeleteDocument: (docId: string) => void;
  onStatusChangeRequest: (docId: string) => void;
  onNavigate: (key: SubpageKey) => void;
}

export function ListSubpage({
  onEditDocument, onViewDocument, onDownloadPdf, onDuplicateDocument,
  onDeleteDocument, onStatusChangeRequest, onNavigate,
}: ListSubpageProps) {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [docPagination, setDocPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [docFilters, setDocFilters] = useState({ type: "", status: "", year: "", search: "" });

  const fetchDocuments = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      const type = docFilters.type && docFilters.type !== "all" ? docFilters.type : "";
      const status = docFilters.status && docFilters.status !== "all" ? docFilters.status : "";
      const year = docFilters.year && docFilters.year !== "all" ? docFilters.year : "";
      if (type) params.set("document_type", type);
      if (status) params.set("status", status);
      if (year) params.set("year", year);
      if (docFilters.search) params.set("search", docFilters.search);
      const data = await api.get<{ documents: Document[]; pagination: Pagination }>(`/documents?${params.toString()}`);
      setDocuments(data.documents);
      setDocPagination(data.pagination);
    } catch { toast.error("Erro ao carregar documentos"); }
    setLoading(false);
  }, [docFilters]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("page", "1"); params.set("limit", "20");
        const data = await api.get<{ documents: Document[]; pagination: Pagination }>(`/documents?${params.toString()}`);
        if (!cancelled) { setDocuments(data.documents); setDocPagination(data.pagination); }
      } catch { if (!cancelled) toast.error("Erro ao carregar documentos"); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDuplicateDocument = async (docId: string) => {
    setLoading(true);
    try {
      const result = await api.post<{ document: Document }>(`/documents/${docId}/duplicate`);
      toast.success(`Documento duplicado! ${result.document.number_formatted} — Protocolo: ${result.document.protocol}`);
      fetchDocuments(docPagination.page);
      onDuplicateDocument?.(docId);
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Erro ao duplicar documento"); }
    setLoading(false);
  };

  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (docFilters.type) params.set("document_type", docFilters.type);
      if (docFilters.status) params.set("status", docFilters.status);
      if (docFilters.year) params.set("year", docFilters.year);
      const data = await api.get<{ documents: Document[] }>(`/documents?${params.toString()}`);
      const XLSX = await import("xlsx");
      const wsData = data.documents.map((doc) => ({
        Tipo: getTypeLabel(doc.document_type), Numero: doc.number_formatted || "",
        Protocolo: doc.protocol, Destinatario: doc.recipient || "",
        Assunto: doc.subject || "", Data: formatDateBR(doc.date),
        Status: getStatusInfo(doc.status).label, Criado_por: doc.creator?.full_name || "",
      }));
      const ws = XLSX.utils.json_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Documentos");
      XLSX.writeFile(wb, `documentos_export_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast.success("Exportação Excel concluída!");
    } catch { toast.error("Erro ao exportar para Excel"); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Todos os Documentos</h1>
        <p className="text-muted-foreground mt-1">Gerencie e consulte todos os documentos do sistema</p>
      </div>

      {/* Filters */}
      <Card><CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={docFilters.type} onValueChange={(v) => setDocFilters((prev) => ({ ...prev, type: v }))}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{DOCUMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={docFilters.status} onValueChange={(v) => setDocFilters((prev) => ({ ...prev, status: v }))}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{DOCUMENT_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ano</Label>
            <Select value={docFilters.year} onValueChange={(v) => setDocFilters((prev) => ({ ...prev, year: v }))}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>
                {Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i)).map((yr) => <SelectItem key={yr} value={yr}>{yr}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Busca</Label>
            <div className="flex items-center gap-2">
              <Input value={docFilters.search} onChange={(e) => setDocFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder="Protocolo, destinatário, assunto..." className="flex-1" />
              <Button size="sm" onClick={() => fetchDocuments(1)} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </CardContent></Card>

      {/* Table */}
      {loading && documents.length === 0 ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : documents.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><FolderOpen className="h-12 w-12 mx-auto mb-2 opacity-50" /><p>Nenhum documento encontrado</p></CardContent></Card>
      ) : (
        <Card><CardContent className="p-4">
          <div className="max-h-[600px] overflow-y-auto">
            <ShadcnTable>
              <ShadcnTableHeader>
                <ShadcnTableRow>
                  <ShadcnTableHead>Tipo</ShadcnTableHead><ShadcnTableHead>Nº Documento</ShadcnTableHead>
                  <ShadcnTableHead>Protocolo</ShadcnTableHead><ShadcnTableHead>Destinatário</ShadcnTableHead>
                  <ShadcnTableHead>Assunto</ShadcnTableHead><ShadcnTableHead>Data</ShadcnTableHead>
                  <ShadcnTableHead>Status</ShadcnTableHead><ShadcnTableHead className="text-right">Ações</ShadcnTableHead>
                </ShadcnTableRow>
              </ShadcnTableHeader>
              <ShadcnTableBody>
                {documents.map((doc) => (
                  <ShadcnTableRow key={doc.id}>
                    <ShadcnTableCell className="text-sm">{getTypeLabel(doc.document_type)}</ShadcnTableCell>
                    <ShadcnTableCell className="text-sm font-medium">{doc.number_formatted || "—"}</ShadcnTableCell>
                    <ShadcnTableCell className="text-sm">{doc.protocol}</ShadcnTableCell>
                    <ShadcnTableCell className="text-sm max-w-[150px] truncate">{doc.recipient || "—"}</ShadcnTableCell>
                    <ShadcnTableCell className="text-sm max-w-[150px] truncate">{doc.subject || "—"}</ShadcnTableCell>
                    <ShadcnTableCell className="text-sm">{formatDateBR(doc.date)}</ShadcnTableCell>
                    <ShadcnTableCell><StatusBadge status={doc.status} /></ShadcnTableCell>
                    <ShadcnTableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" title="Ações" aria-label={`Ações do documento ${doc.number_formatted || doc.protocol}`}><ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onViewDocument(doc.id)}><Eye className="h-4 w-4 mr-2" /> Visualizar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onEditDocument(doc)}><Pencil className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onDownloadPdf(doc.id, doc.number_formatted || doc.protocol)}><Download className="h-4 w-4 mr-2" /> PDF</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicateDocument(doc.id)}><Copy className="h-4 w-4 mr-2" /> Duplicar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onStatusChangeRequest(doc.id)}><ArrowRight className="h-4 w-4 mr-2" /> Alterar Status</DropdownMenuItem>
                          {(doc.status === "draft" || doc.status === "cancelled") && (
                            <DropdownMenuItem className="text-red-600" onClick={() => onDeleteDocument(doc.id)}><Trash2 className="h-4 w-4 mr-2" /> Excluir</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ShadcnTableCell>
                  </ShadcnTableRow>
                ))}
              </ShadcnTableBody>
            </ShadcnTable>
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">{docPagination.total} documento(s) — Página {docPagination.page} de {docPagination.totalPages}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={docPagination.page <= 1} onClick={() => fetchDocuments(docPagination.page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" disabled={docPagination.page >= docPagination.totalPages} onClick={() => fetchDocuments(docPagination.page + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardContent></Card>
      )}
    </motion.div>
  );
}
