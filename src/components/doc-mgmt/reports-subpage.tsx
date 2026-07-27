"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileDown } from "lucide-react";
import {
  DashboardData, Document, DOCUMENT_TYPES, CHART_COLORS,
  getTypeLabel, getStatusInfo, formatDateBR, SubpageKey,
} from "./shared";

interface ReportsSubpageProps {
  onNavigate: (key: SubpageKey) => void;
}

export function ReportsSubpage({ onNavigate }: ReportsSubpageProps) {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<DashboardData | null>(null);
  const [reportFilters, setReportFilters] = useState({ type: "", dateFrom: "", dateTo: "" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<DashboardData>("/documents/dashboard");
        if (!cancelled) setReportData(data);
      } catch { if (!cancelled) toast.error("Erro ao carregar dados de relatório"); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (reportFilters.type) params.set("document_type", reportFilters.type);
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

  if (loading && !reportData) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!reportData) return null;

  const currentYear = new Date().getFullYear();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="text-muted-foreground mt-1">Análise e exportação de dados documentais</p>
      </div>

      {/* Filters & Export */}
      <Card><CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={reportFilters.type} onValueChange={(v) => setReportFilters((prev) => ({ ...prev, type: v }))}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{DOCUMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Data Início</Label><Input type="date" value={reportFilters.dateFrom} onChange={(e) => setReportFilters((prev) => ({ ...prev, dateFrom: e.target.value }))} className="w-[140px]" /></div>
          <div className="space-y-1"><Label className="text-xs">Data Fim</Label><Input type="date" value={reportFilters.dateTo} onChange={(e) => setReportFilters((prev) => ({ ...prev, dateTo: e.target.value }))} className="w-[140px]" /></div>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={handleExportExcel}><FileDown className="h-4 w-4 mr-1" /> Excel</Button>
          </div>
        </div>
      </CardContent></Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-bold">{reportData.totalDocuments}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Em Elaboração</p><p className="text-2xl font-bold">{reportData.documentsByStatus?.find((s) => s.status === "draft")?.count || 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Assinados</p><p className="text-2xl font-bold">{reportData.documentsByStatus?.find((s) => s.status === "signed")?.count || 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Arquivados</p><p className="text-2xl font-bold">{reportData.documentsByStatus?.find((s) => s.status === "archived")?.count || 0}</p></CardContent></Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Por Tipo</CardTitle></CardHeader>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={reportData.documentsByType}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="document_type" tickFormatter={(v) => getTypeLabel(v)} tick={{ fontSize: 10 }} angle={-20} interval={0} />
                <YAxis width={40} />
                <Tooltip formatter={(value: number) => [value, "Quantidade"]} labelFormatter={(label) => getTypeLabel(String(label))} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {reportData.documentsByType.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Por Status</CardTitle></CardHeader>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={reportData.documentsByStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80}
                  label={({ status, count }) => `${getStatusInfo(status).label}: ${count}`}>
                  {reportData.documentsByStatus.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value: number) => [value, "Quantidade"]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Por Mês ({currentYear})</CardTitle></CardHeader>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={reportData.documentsByMonth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis width={40} />
                <Tooltip formatter={(value: number) => [value, "Documentos"]} />
                <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
