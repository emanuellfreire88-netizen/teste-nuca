"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  GraduationCap,
  UserCheck,
  UserX,
  School,
  ClipboardCheck,
  Download,
  Loader2,
  BarChart3,
  Users,
  Calendar,
  CalendarDays,
  CalendarRange,
  Search,
  FileText,
  CheckCircle2,
  User,
  Printer,
  ArrowDownAZ,
  ArrowUpZA,
  BookOpen,
  XCircle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────
interface SchoolEntry {
  id: string;
  name: string;
  student_count: number;
}

interface AttendanceSummary {
  present: number;
  absent: number;
  total: number;
}

interface ReportsData {
  students: { total: number; active: number; inactive: number; per_school: SchoolEntry[] };
  schools: { total: number };
  attendance: { today: AttendanceSummary; this_week: AttendanceSummary; this_month: AttendanceSummary };
}

interface StudentOption {
  id: string;
  full_name: string;
  school: { id: string; name: string };
  class: string | null;
  grade: string | null;
  photo: string | null;
}

interface StudentReportEvent {
  id: string;
  title: string;
  date: string;
  location: string | null;
  status: string;
  attended: boolean;
  notes: string | null;
}

interface StudentReport {
  student: {
    id: string; full_name: string; cpf: string | null; rg: string | null;
    date_of_birth: string | null; blood_type: string | null; special_needs: string | null;
    medications: string | null; class: string | null; grade: string | null;
    phone: string | null; address: string | null; guardian_name: string | null;
    guardian_phone: string | null; guardian_email: string | null;
    emergency_contact: string | null; status: string; photo: string | null;
  };
  school: {
    id: string; name: string; address: string | null; phone: string | null;
    email: string | null; director_name: string | null;
  };
  events: StudentReportEvent[];
  attendance_summary: { total_events: number; attended_count: number; absent_count: number; attendance_rate: number };
}

interface GroupedStudent {
  id: string;
  full_name: string;
  cpf: string | null;
  rg: string | null;
  date_of_birth: Date | null;
  grade: string | null;
  class: string | null;
  status: string;
  phone: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  photo: string | null;
}

interface SchoolGroup {
  school_id: string;
  school_name: string;
  school_address: string | null;
  school_phone: string | null;
  school_director: string | null;
  students: GroupedStudent[];
}

interface GroupedReportData {
  groups: SchoolGroup[];
  grand_total: number;
  filters: {
    schools: { id: string; name: string }[];
    grades: string[];
    classes: string[];
  };
}

// ─── Constants ──────────────────────────────────────────────────────
const CHART_COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#c084fc", "#d8b4fe", "#7c3aed", "#9333ea", "#a78bfa"];

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const eventStatusLabels: Record<string, string> = { upcoming: "Próximo", ongoing: "Em Andamento", completed: "Concluído", cancelled: "Cancelado" };
const eventStatusBadgeClass: Record<string, string> = {
  upcoming: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  ongoing: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-800",
};

const statusBadgeClass: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200",
  inactive: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300 border-red-200",
};

// ─── Component ──────────────────────────────────────────────────────
export function ReportsPage() {
  const currentUser = useAuthStore((s) => s.user);
  const canExport = currentUser?.role === "Admin" || currentUser?.role === "Operator";

  // General report state
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Grouped report state
  const [groupedData, setGroupedData] = useState<GroupedReportData | null>(null);
  const [loadingGrouped, setLoadingGrouped] = useState(false);
  const [filterSchool, setFilterSchool] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterSort, setFilterSort] = useState<"asc" | "desc">("asc");

  // Export state
  const [exportType, setExportType] = useState<"students" | "attendance" | "schools">("students");
  const [exportFormat, setExportFormat] = useState<"excel" | "pdf">("excel");
  const [exporting, setExporting] = useState(false);

  // Individual report state
  const [studentSearch, setStudentSearch] = useState("");
  const debouncedSearch = useDebounce(studentSearch, 300);
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [studentReport, setStudentReport] = useState<StudentReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [exportingIndividual, setExportingIndividual] = useState(false);

  // ─── Fetch general data ─────────────────────────────────────────
  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.get<ReportsData>("/reports");
      setData(result);
    } catch {
      toast.error("Erro ao carregar relatórios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // ─── Fetch grouped data ─────────────────────────────────────────
  const fetchGrouped = useCallback(async () => {
    try {
      setLoadingGrouped(true);
      const params = new URLSearchParams();
      if (filterSchool) params.set("school_id", filterSchool);
      if (filterStatus) params.set("status", filterStatus);
      if (filterGrade) params.set("grade", filterGrade);
      if (filterClass) params.set("class", filterClass);
      params.set("sort", filterSort);
      const result = await api.get<GroupedReportData>(`/reports/students-grouped?${params.toString()}`);
      setGroupedData(result);
    } catch {
      toast.error("Erro ao carregar relatório agrupado");
    } finally {
      setLoadingGrouped(false);
    }
  }, [filterSchool, filterStatus, filterGrade, filterClass, filterSort]);

  useEffect(() => { fetchGrouped(); }, [fetchGrouped]);

  // ─── Individual report: student search ──────────────────────────
  useEffect(() => {
    if (!debouncedSearch) { setStudentOptions([]); return; }
    let cancelled = false;
    const fetch = async () => {
      try {
        setLoadingStudents(true);
        const result = await api.get<{ students: StudentOption[] }>(`/students?search=${encodeURIComponent(debouncedSearch)}&limit=20`);
        if (!cancelled) setStudentOptions(result.students);
      } catch { if (!cancelled) toast.error("Erro ao buscar alunos"); }
      finally { if (!cancelled) setLoadingStudents(false); }
    };
    fetch();
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  const handleGenerateReport = async () => {
    if (!selectedStudentId) { toast.error("Selecione um aluno"); return; }
    try {
      setLoadingReport(true);
      setStudentReport(null);
      const result = await api.get<StudentReport>(`/reports/student/${selectedStudentId}`);
      setStudentReport(result);
    } catch { toast.error("Erro ao gerar relatório do aluno"); }
    finally { setLoadingReport(false); }
  };

  const handleExportIndividual = async () => {
    if (!studentReport) return;
    try {
      setExportingIndividual(true);
      const token = useAuthStore.getState().token;
      const response = await fetch(`/api/reports/student/${studentReport.student.id}/export?format=pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Erro na exportação");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${studentReport.student.full_name.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Relatório individual exportado em PDF");
    } catch { toast.error("Erro ao exportar relatório individual"); }
    finally { setExportingIndividual(false); }
  };

  // ─── Export grouped ─────────────────────────────────────────────
  const handleExport = async (overrideType?: "students" | "attendance" | "schools", overrideFormat?: "excel" | "pdf") => {
    const type = overrideType || exportType;
    const format = overrideFormat || exportFormat;
    try {
      setExporting(true);
      const token = useAuthStore.getState().token;
      const params = new URLSearchParams();
      params.set("format", format);
      params.set("type", type);
      if (filterSchool) params.set("school_id", filterSchool);
      if (filterStatus) params.set("status", filterStatus);
      if (filterGrade) params.set("grade", filterGrade);
      if (filterClass) params.set("class", filterClass);
      params.set("sort", filterSort);

      const response = await fetch(`/api/reports/export?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Erro na exportação");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${type}.${format === "excel" ? "xlsx" : "pdf"}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Relatório exportado em ${format === "excel" ? "Excel" : "PDF"}`);
    } catch { toast.error("Erro ao exportar relatório"); }
    finally { setExporting(false); }
  };

  // ─── Print grouped ──────────────────────────────────────────────
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Relatório de Alunos por Escola</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        h1 { font-size: 20px; margin-bottom: 5px; }
        h2 { font-size: 16px; color: #228B22; border-bottom: 2px solid #228B22; padding-bottom: 4px; margin-top: 24px; }
        .date { font-size: 12px; color: #666; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
        th { background: #228B22; color: white; padding: 6px 8px; text-align: left; }
        td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
        tr:nth-child(even) { background: #f9f9f9; }
        .subtotal { font-weight: bold; margin-top: 6px; font-size: 13px; }
        .grand-total { font-size: 16px; font-weight: bold; color: #228B22; margin-top: 30px; border-top: 2px solid #228B22; padding-top: 10px; }
        .badge-active { color: #059669; } .badge-inactive { color: #dc2626; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>Relatório de Alunos por Escola</h1>
      <div class="date">Gerado em: ${new Date().toLocaleDateString("pt-BR")}</div>
      ${printRef.current.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // ─── Chart data ──────────────────────────────────────────────────
  const chartData = (data?.students.per_school || []).map((s) => ({
    name: s.name.length > 20 ? s.name.substring(0, 20) + "…" : s.name,
    alunos: s.student_count,
  }));

  const attendanceCards = [
    { title: "Hoje", icon: Calendar, data: data?.attendance.today, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/50" },
    { title: "Esta Semana", icon: CalendarDays, data: data?.attendance.this_week, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/50" },
    { title: "Este Mês", icon: CalendarRange, data: data?.attendance.this_month, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/50" },
  ];

  const studentCards = [
    { title: "Total de Alunos", value: data?.students.total ?? 0, icon: GraduationCap, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/50" },
    { title: "Alunos Ativos", value: data?.students.active ?? 0, icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/50" },
    { title: "Alunos Inativos", value: data?.students.inactive ?? 0, icon: UserX, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/50" },
    { title: "Total de Escolas", value: data?.schools.total ?? 0, icon: School, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/50" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground mt-1">Visão geral dos dados do sistema</p>
      </div>

      <Tabs defaultValue="alunos-escola" className="space-y-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="alunos-escola" className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" />
            Alunos por Escola
          </TabsTrigger>
          <TabsTrigger value="geral" className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Geral
          </TabsTrigger>
          {canExport && (
            <TabsTrigger value="individual" className="flex items-center gap-1.5">
              <User className="h-4 w-4" />
              Individual
            </TabsTrigger>
          )}
        </TabsList>

        {/* ═══ ALUNOS POR ESCOLA TAB ═══════════════════════════════════ */}
        <TabsContent value="alunos-escola" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4" />
                Filtros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1.5">
                  <Label className="text-xs">Escola</Label>
                  <select
                    value={filterSchool}
                    onChange={(e) => setFilterSchool(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Todas as escolas</option>
                    {groupedData?.filters.schools.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Todos</option>
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Série</Label>
                  <select
                    value={filterGrade}
                    onChange={(e) => setFilterGrade(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Todas</option>
                    {groupedData?.filters.grades.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Turma</Label>
                  <select
                    value={filterClass}
                    onChange={(e) => setFilterClass(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Todas</option>
                    {groupedData?.filters.classes.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ordem</Label>
                  <button
                    type="button"
                    onClick={() => setFilterSort(filterSort === "asc" ? "desc" : "asc")}
                    className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs hover:bg-accent hover:text-accent-foreground"
                  >
                    {filterSort === "asc" ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpZA className="h-4 w-4" />}
                    {filterSort === "asc" ? "A → Z" : "Z → A"}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Export / Print buttons */}
          {canExport && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint} disabled={loadingGrouped}>
                <Printer className="h-4 w-4 mr-2" /> Imprimir
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("students", "pdf")} disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Exportar PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("students", "excel")} disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Exportar Excel
              </Button>
            </div>
          )}

          {/* Loading */}
          {loadingGrouped && (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
              ))}
            </div>
          )}

          {/* Grouped results */}
          {!loadingGrouped && groupedData && (
            <div ref={printRef} className="space-y-6">
              {groupedData.groups.length === 0 ? (
                <Card>
                  <CardContent className="py-12 flex flex-col items-center text-muted-foreground">
                    <School className="h-10 w-10 mb-3" />
                    <p className="text-sm">Nenhum aluno encontrado com os filtros selecionados</p>
                  </CardContent>
                </Card>
              ) : (
                groupedData.groups.map((group) => (
                  <Card key={group.school_id} className="overflow-hidden">
                    <CardHeader className="bg-emerald-50 dark:bg-emerald-950/30 pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <School className="h-5 w-5 text-emerald-600" />
                          {group.school_name}
                        </CardTitle>
                        <Badge variant="outline" className="bg-white dark:bg-background">
                          {group.students.length} aluno{group.students.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      {group.school_director && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Diretor(a): {group.school_director}
                          {group.school_phone && ` • Tel: ${group.school_phone}`}
                        </p>
                      )}
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>Série</TableHead>
                            <TableHead>Turma</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Telefone</TableHead>
                            <TableHead>Responsável</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.students.map((student, idx) => (
                            <TableRow key={student.id}>
                              <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-7 w-7">
                                    <AvatarImage src={student.photo || undefined} alt={student.full_name} />
                                    <AvatarFallback className="text-[10px]">{getInitials(student.full_name)}</AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium">{student.full_name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{student.grade || "—"}</TableCell>
                              <TableCell className="text-sm">{student.class || "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={statusBadgeClass[student.status] || ""}>
                                  {student.status === "active" ? "Ativo" : "Inativo"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{student.phone || "—"}</TableCell>
                              <TableCell className="text-sm">{student.guardian_name || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <div className="px-6 py-3 bg-muted/30 border-t text-sm font-medium text-muted-foreground">
                        Total: {group.students.length} aluno{group.students.length !== 1 ? "s" : ""}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}

              {/* Grand Total */}
              {groupedData.groups.length > 0 && (
                <div className="flex items-center justify-center gap-3 py-4 px-6 rounded-lg border-2 border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <BarChart3 className="h-5 w-5 text-emerald-600" />
                  <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                    Total Geral: {groupedData.grand_total} aluno{groupedData.grand_total !== 1 ? "s" : ""}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    em {groupedData.groups.length} escola{groupedData.groups.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ═══ GERAL TAB ═════════════════════════════════════════════════ */}
        <TabsContent value="geral" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {studentCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.title}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                    <div className={`rounded-lg p-2 ${card.bg}`}><Icon className={`h-4 w-4 ${card.color}`} /></div>
                  </CardHeader>
                  <CardContent>
                    {loading ? <Skeleton className="h-8 w-20" /> : <p className="text-3xl font-bold tracking-tight">{card.value.toLocaleString("pt-BR")}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><ClipboardCheck className="h-5 w-5" />Resumo de Frequência</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {attendanceCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card key={card.title}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                      <div className={`rounded-lg p-2 ${card.bg}`}><Icon className={`h-4 w-4 ${card.color}`} /></div>
                    </CardHeader>
                    <CardContent>
                      {loading ? <div className="space-y-2"><Skeleton className="h-8 w-16" /><Skeleton className="h-3 w-32" /></div> : card.data ? (
                        <div className="space-y-1">
                          <p className="text-3xl font-bold tracking-tight">{card.data.present.toLocaleString("pt-BR")}<span className="text-sm font-normal text-muted-foreground ml-1">presentes</span></p>
                          <div className="w-full bg-muted rounded-full h-2 mt-2">
                            <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: card.data.total > 0 ? `${(card.data.present / card.data.total) * 100}%` : "0%" }} />
                          </div>
                          <p className="text-xs text-muted-foreground">Total: {card.data.total.toLocaleString("pt-BR")}</p>
                        </div>
                      ) : <p className="text-muted-foreground text-sm">Sem dados</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />Alunos por Escola</CardTitle></CardHeader>
              <CardContent>
                {loading ? <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
                : chartData.length === 0 ? <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Nenhuma escola cadastrada</div>
                : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" angle={-35} textAnchor="end" fontSize={12} className="fill-muted-foreground" interval={0} />
                      <YAxis className="fill-muted-foreground" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }} formatter={(value: number) => [value.toLocaleString("pt-BR"), "Alunos"]} />
                      <Bar dataKey="alunos" radius={[6, 6, 0, 0]}>{chartData.map((_, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" />Exportar Relatório</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <select value={exportType} onChange={(e) => setExportType(e.target.value as typeof exportType)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    <option value="students">Alunos</option>
                    <option value="attendance">Frequência</option>
                    <option value="schools">Escolas</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Formato</Label>
                  <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value as typeof exportFormat)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    <option value="excel">Excel (.xlsx)</option>
                    <option value="pdf">PDF (.pdf)</option>
                  </select>
                </div>
                <Button className="w-full" onClick={() => handleExport()} disabled={exporting}>
                  {exporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Exportando...</> : <><Download className="mr-2 h-4 w-4" />Exportar</>}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ INDIVIDUAL TAB ═════════════════════════════════════════════ */}
        {canExport && (
          <TabsContent value="individual" className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Relatório Individual do Aluno</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <Label>Buscar Aluno</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Buscar por nome, CPF ou RG..." value={studentSearch} onChange={(e) => { setStudentSearch(e.target.value); setSelectedStudentId(""); setStudentReport(null); }} className="pl-9" />
                    </div>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleGenerateReport} disabled={!selectedStudentId || loadingReport}>
                      {loadingReport ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Gerando...</> : <><FileText className="mr-2 h-4 w-4" />Gerar Relatório</>}
                    </Button>
                  </div>
                </div>
                {studentSearch && !selectedStudentId && (
                  <div className="border rounded-lg max-h-48 overflow-y-auto">
                    {loadingStudents ? <div className="p-4 flex items-center justify-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Buscando...</div>
                    : studentOptions.length === 0 ? <div className="p-4 text-center text-muted-foreground text-sm">Nenhum aluno encontrado</div>
                    : studentOptions.map((s) => (
                      <button key={s.id} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors border-b last:border-b-0" onClick={() => { setSelectedStudentId(s.id); setStudentSearch(s.full_name); setStudentReport(null); }}>
                        <Avatar className="h-8 w-8"><AvatarImage src={s.photo || undefined} alt={s.full_name} /><AvatarFallback className="text-xs">{getInitials(s.full_name)}</AvatarFallback></Avatar>
                        <div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{s.full_name}</p><p className="text-xs text-muted-foreground truncate">{s.school.name}{s.grade ? ` • ${s.grade}` : ""}{s.class ? ` • ${s.class}` : ""}</p></div>
                      </button>
                    ))}
                  </div>
                )}
                {selectedStudentId && studentOptions.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Aluno selecionado: <strong>{studentOptions.find((s) => s.id === selectedStudentId)?.full_name || studentSearch}</strong></span>
                  </div>
                )}
              </CardContent>
            </Card>

            {loadingReport && <Card><CardContent className="p-6"><div className="flex flex-col items-center justify-center gap-3"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /><p className="text-muted-foreground text-sm">Gerando relatório...</p></div></CardContent></Card>}

            {studentReport && !loadingReport && (
              <div className="space-y-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row gap-6">
                      <Avatar className="h-20 w-20 mx-auto sm:mx-0"><AvatarImage src={studentReport.student.photo || undefined} alt={studentReport.student.full_name} /><AvatarFallback className="text-xl">{getInitials(studentReport.student.full_name)}</AvatarFallback></Avatar>
                      <div className="flex-1 space-y-3 text-center sm:text-left">
                        <div>
                          <h3 className="text-xl font-bold">{studentReport.student.full_name}</h3>
                          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-1">
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700">{studentReport.student.status === "active" ? "Ativo" : "Inativo"}</Badge>
                            {studentReport.student.cpf && <span className="text-sm text-muted-foreground">CPF: {studentReport.student.cpf}</span>}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                          {studentReport.student.grade && <div><span className="text-muted-foreground">Série: </span><span className="font-medium">{studentReport.student.grade}</span></div>}
                          {studentReport.student.class && <div><span className="text-muted-foreground">Turma: </span><span className="font-medium">{studentReport.student.class}</span></div>}
                          <div><span className="text-muted-foreground">Escola: </span><span className="font-medium">{studentReport.school.name}</span></div>
                          {studentReport.student.date_of_birth && <div><span className="text-muted-foreground">Nascimento: </span><span className="font-medium">{formatDate(studentReport.student.date_of_birth)}</span></div>}
                          {studentReport.student.phone && <div><span className="text-muted-foreground">Telefone: </span><span className="font-medium">{studentReport.student.phone}</span></div>}
                          {studentReport.student.guardian_name && <div><span className="text-muted-foreground">Responsável: </span><span className="font-medium">{studentReport.student.guardian_name}</span></div>}
                          {studentReport.student.blood_type && <div><span className="text-muted-foreground">Tipo Sanguíneo: </span><span className="font-medium">{studentReport.student.blood_type}</span></div>}
                          {studentReport.student.special_needs && <div><span className="text-muted-foreground">Necessidades Especiais: </span><span className="font-medium">{studentReport.student.special_needs}</span></div>}
                          {studentReport.school.director_name && <div><span className="text-muted-foreground">Diretor(a): </span><span className="font-medium">{studentReport.school.director_name}</span></div>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total de Eventos</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{studentReport.attendance_summary.total_events}</p><p className="text-xs text-muted-foreground mt-1">eventos participados</p></CardContent></Card>
                  <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Presenças</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold text-emerald-600">{studentReport.attendance_summary.attended_count}</p><p className="text-xs text-muted-foreground mt-1">de {studentReport.attendance_summary.total_events} eventos</p></CardContent></Card>
                  <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Frequência</CardTitle></CardHeader><CardContent className="space-y-2"><p className="text-3xl font-bold">{studentReport.attendance_summary.attendance_rate}%</p><Progress value={studentReport.attendance_summary.attendance_rate} className="h-2" /><p className="text-xs text-muted-foreground">{studentReport.attendance_summary.attended_count} presentes • {studentReport.attendance_summary.absent_count} ausentes</p></CardContent></Card>
                </div>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" />Eventos Participados</CardTitle>
                    <Button variant="outline" size="sm" onClick={handleExportIndividual} disabled={exportingIndividual}>
                      {exportingIndividual ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Exportando...</> : <><Download className="mr-2 h-4 w-4" />Exportar PDF</>}
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    {studentReport.events.length === 0 ? <div className="flex flex-col items-center justify-center py-12 text-muted-foreground"><Calendar className="h-10 w-10 mb-3" /><p className="text-sm">Nenhum evento participado</p></div> : (
                      <Table>
                        <TableHeader><TableRow><TableHead>Evento</TableHead><TableHead>Data</TableHead><TableHead>Local</TableHead><TableHead>Status</TableHead><TableHead className="text-center">Presença</TableHead><TableHead>Observações</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {studentReport.events.map((event) => (
                            <TableRow key={event.id}>
                              <TableCell className="font-medium">{event.title}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">{formatDateTime(event.date)}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">{event.location || "—"}</TableCell>
                              <TableCell><Badge variant="outline" className={eventStatusBadgeClass[event.status] || ""}>{eventStatusLabels[event.status] || event.status}</Badge></TableCell>
                              <TableCell className="text-center">{event.attended ? <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" /> : <XCircle className="h-5 w-5 text-red-500 mx-auto" />}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{event.notes || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
