"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table as ShadcnTable,
  TableBody as ShadcnTableBody,
  TableCell as ShadcnTableCell,
  TableHead as ShadcnTableHead,
  TableHeader as ShadcnTableHeader,
  TableRow as ShadcnTableRow,
} from "@/components/ui/table";
import { Loader2, FolderOpen, FileText, Clock, Archive, Eye, Pencil, Download } from "lucide-react";
import {
  DashboardData,
  Document,
  CHART_COLORS,
  getTypeLabel,
  getStatusInfo,
  formatDateBR,
  StatusBadge,
} from "./shared";

interface DashboardSubpageProps {
  onEditDocument: (doc: Document) => void;
  onViewDocument: (docId: string) => void;
  onDownloadPdf: (docId: string, docNumber: string) => void;
}

export function DashboardSubpage({ onEditDocument, onViewDocument, onDownloadPdf }: DashboardSubpageProps) {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<DashboardData>("/documents/dashboard");
        if (!cancelled) setDashboardData(data);
      } catch {
        if (!cancelled) toast.error("Erro ao carregar dados do dashboard");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading && !dashboardData) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!dashboardData) return null;

  const pendingCount = dashboardData.pendingDocuments?.length || 0;
  const archivedCount = dashboardData.documentsByStatus?.find((s) => s.status === "archived")?.count || 0;
  const monthCount = dashboardData.documentsByMonth?.reduce((sum, m) => sum + m.count, 0) || 0;
  const currentYear = new Date().getFullYear();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Dashboard — Gestão Documental</h1>
        <p className="text-muted-foreground mt-1">Visão geral do módulo de gestão documental</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <FolderOpen className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total de Documentos</p>
                <p className="text-2xl font-bold">{dashboardData.totalDocuments}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Este Ano ({currentYear})</p>
                <p className="text-2xl font-bold">{monthCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-sm text-muted-foreground">Em Elaboração</p>
                <p className="text-2xl font-bold">{pendingCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Archive className="h-8 w-8 text-gray-500" />
              <div>
                <p className="text-sm text-muted-foreground">Arquivados</p>
                <p className="text-2xl font-bold">{archivedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Documentos por Tipo</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dashboardData.documentsByType}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="document_type" tickFormatter={(v) => getTypeLabel(v)} tick={{ fontSize: 10 }} interval={0} angle={-20} />
                <YAxis width={40} />
                <Tooltip formatter={(value: number) => [value, "Quantidade"]} labelFormatter={(label) => getTypeLabel(String(label))} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {dashboardData.documentsByType.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Documentos por Status</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={dashboardData.documentsByStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80}
                  label={({ status, count }) => `${getStatusInfo(status).label}: ${count}`}>
                  {dashboardData.documentsByStatus.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [value, "Quantidade"]} labelFormatter={(label) => getStatusInfo(String(label)).label} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Documentos por Mês ({currentYear})</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={dashboardData.documentsByMonth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis width={40} />
                <Tooltip formatter={(value: number) => [value, "Documentos"]} />
                <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Documents */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Documentos Recentes</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="max-h-96 overflow-y-auto">
            <ShadcnTable>
              <ShadcnTableHeader>
                <ShadcnTableRow>
                  <ShadcnTableHead>Tipo</ShadcnTableHead>
                  <ShadcnTableHead>Nº</ShadcnTableHead>
                  <ShadcnTableHead>Assunto</ShadcnTableHead>
                  <ShadcnTableHead>Status</ShadcnTableHead>
                  <ShadcnTableHead>Data</ShadcnTableHead>
                  <ShadcnTableHead className="text-right">Ações</ShadcnTableHead>
                </ShadcnTableRow>
              </ShadcnTableHeader>
              <ShadcnTableBody>
                {dashboardData.recentDocuments.map((doc) => (
                  <ShadcnTableRow key={doc.id}>
                    <ShadcnTableCell className="text-sm">{getTypeLabel(doc.document_type)}</ShadcnTableCell>
                    <ShadcnTableCell className="text-sm font-medium">{doc.number_formatted || doc.protocol}</ShadcnTableCell>
                    <ShadcnTableCell className="text-sm max-w-[200px] truncate">{doc.subject || "—"}</ShadcnTableCell>
                    <ShadcnTableCell><StatusBadge status={doc.status} /></ShadcnTableCell>
                    <ShadcnTableCell className="text-sm">{formatDateBR(doc.date)}</ShadcnTableCell>
                    <ShadcnTableCell className="text-right">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => onViewDocument(doc.id)} title="Visualizar"><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => onEditDocument(doc)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => onDownloadPdf(doc.id, doc.number_formatted || doc.protocol)} title="PDF"><Download className="h-4 w-4" /></Button>
                      </div>
                    </ShadcnTableCell>
                  </ShadcnTableRow>
                ))}
              </ShadcnTableBody>
            </ShadcnTable>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
