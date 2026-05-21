"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { api } from "@/lib/api";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  XCircle,
  User,
} from "lucide-react";

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
  students: {
    total: number;
    active: number;
    inactive: number;
    per_school: SchoolEntry[];
  };
  schools: {
    total: number;
  };
  attendance: {
    today: AttendanceSummary;
    this_week: AttendanceSummary;
    this_month: AttendanceSummary;
  };
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
    id: string;
    full_name: string;
    cpf: string | null;
    rg: string | null;
    date_of_birth: string | null;
    blood_type: string | null;
    special_needs: string | null;
    medications: string | null;
    class: string | null;
    grade: string | null;
    phone: string | null;
    address: string | null;
    guardian_name: string | null;
    guardian_phone: string | null;
    guardian_email: string | null;
    emergency_contact: string | null;
    status: string;
    photo: string | null;
  };
  school: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    director_name: string | null;
  };
  events: StudentReportEvent[];
  attendance_summary: {
    total_events: number;
    attended_count: number;
    absent_count: number;
    attendance_rate: number;
  };
}

const CHART_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#c084fc",
  "#d8b4fe",
  "#7c3aed",
  "#9333ea",
  "#a78bfa",
];

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const eventStatusLabels: Record<string, string> = {
  upcoming: "Próximo",
  ongoing: "Em Andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const eventStatusBadgeClass: Record<string, string> = {
  upcoming: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  ongoing: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-800",
};

export function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
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
  const studentSearchRef = useRef(false);

  const currentUser = useAuthStore((s) => s.user);
  const canViewIndividual = currentUser?.role === "Admin" || currentUser?.role === "Operator";

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

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Fetch students for search dropdown
  useEffect(() => {
    if (!debouncedSearch || !canViewIndividual) {
      setStudentOptions([]);
      return;
    }
    let cancelled = false;
    const fetchStudents = async () => {
      try {
        setLoadingStudents(true);
        const result = await api.get<{ students: StudentOption[] }>(
          `/students?search=${encodeURIComponent(debouncedSearch)}&limit=20`
        );
        if (!cancelled) {
          setStudentOptions(result.students);
        }
      } catch {
        if (!cancelled) {
          toast.error("Erro ao buscar alunos");
        }
      } finally {
        if (!cancelled) {
          setLoadingStudents(false);
        }
      }
    };
    fetchStudents();
    return () => { cancelled = true; };
  }, [debouncedSearch, canViewIndividual]);

  const handleGenerateReport = async () => {
    if (!selectedStudentId) {
      toast.error("Selecione um aluno");
      return;
    }
    try {
      setLoadingReport(true);
      setStudentReport(null);
      const result = await api.get<StudentReport>(`/reports/student/${selectedStudentId}`);
      setStudentReport(result);
    } catch {
      toast.error("Erro ao gerar relatório do aluno");
    } finally {
      setLoadingReport(false);
    }
  };

  const handleExportIndividual = async () => {
    if (!studentReport) return;
    try {
      setExportingIndividual(true);
      const token = useAuthStore.getState().token;
      const response = await fetch(
        `/api/reports/student/${studentReport.student.id}/export?format=pdf`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) throw new Error("Erro na exportação");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${studentReport.student.full_name.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Relatório individual exportado em PDF");
    } catch {
      toast.error("Erro ao exportar relatório individual");
    } finally {
      setExportingIndividual(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const token = useAuthStore.getState().token;
      const params = new URLSearchParams();
      params.set("format", exportFormat);
      params.set("type", exportType);

      const response = await fetch(`/api/reports/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Erro na exportação");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${exportType}.${exportFormat === "excel" ? "xlsx" : "pdf"}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `Relatório exportado com sucesso em ${exportFormat === "excel" ? "Excel" : "PDF"}`
      );
    } catch {
      toast.error("Erro ao exportar relatório");
    } finally {
      setExporting(false);
    }
  };

  const chartData = (data?.students.per_school || []).map((s) => ({
    name: s.name.length > 20 ? s.name.substring(0, 20) + "…" : s.name,
    alunos: s.student_count,
  }));

  const attendanceCards = [
    {
      title: "Hoje",
      icon: Calendar,
      data: data?.attendance.today,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-950/50",
    },
    {
      title: "Esta Semana",
      icon: CalendarDays,
      data: data?.attendance.this_week,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950/50",
    },
    {
      title: "Este Mês",
      icon: CalendarRange,
      data: data?.attendance.this_month,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-950/50",
    },
  ];

  const studentCards = [
    {
      title: "Total de Alunos",
      value: data?.students.total ?? 0,
      icon: GraduationCap,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950/50",
    },
    {
      title: "Alunos Ativos",
      value: data?.students.active ?? 0,
      icon: UserCheck,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-950/50",
    },
    {
      title: "Alunos Inativos",
      value: data?.students.inactive ?? 0,
      icon: UserX,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-50 dark:bg-red-950/50",
    },
    {
      title: "Total de Escolas",
      value: data?.schools.total ?? 0,
      icon: School,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground mt-1">
          Visão geral dos dados do sistema
        </p>
      </div>

      <Tabs defaultValue="geral" className="space-y-6">
        <TabsList>
          <TabsTrigger value="geral" className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Geral
          </TabsTrigger>
          {canViewIndividual && (
            <TabsTrigger value="individual" className="flex items-center gap-1.5">
              <User className="h-4 w-4" />
              Individual
            </TabsTrigger>
          )}
        </TabsList>

        {/* ─── GERAL TAB ─── */}
        <TabsContent value="geral" className="space-y-6">
          {/* Student Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {studentCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.title}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {card.title}
                    </CardTitle>
                    <div className={`rounded-lg p-2 ${card.bg}`}>
                      <Icon className={`h-4 w-4 ${card.color}`} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      <p className="text-3xl font-bold tracking-tight">
                        {card.value.toLocaleString("pt-BR")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Attendance Summary */}
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Resumo de Frequência
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {attendanceCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card key={card.title}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {card.title}
                      </CardTitle>
                      <div className={`rounded-lg p-2 ${card.bg}`}>
                        <Icon className={`h-4 w-4 ${card.color}`} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      {loading ? (
                        <div className="space-y-2">
                          <Skeleton className="h-8 w-16" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                      ) : card.data ? (
                        <div className="space-y-1">
                          <p className="text-3xl font-bold tracking-tight">
                            {card.data.present.toLocaleString("pt-BR")}
                            <span className="text-sm font-normal text-muted-foreground ml-1">
                              presentes
                            </span>
                          </p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                              {card.data.present} presentes
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                              {card.data.absent} ausentes
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2 mt-2">
                            <div
                              className="bg-emerald-500 h-2 rounded-full transition-all"
                              style={{
                                width: card.data.total > 0
                                  ? `${(card.data.present / card.data.total) * 100}%`
                                  : "0%",
                              }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Total: {card.data.total.toLocaleString("pt-BR")}
                          </p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">Sem dados</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Students per School Chart + Export */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Alunos por Escola
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-6 w-full" />
                    ))}
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                    Nenhuma escola cadastrada
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      data={chartData}
                      margin={{ top: 5, right: 20, left: 0, bottom: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="name"
                        angle={-35}
                        textAnchor="end"
                        fontSize={12}
                        className="fill-muted-foreground"
                        interval={0}
                      />
                      <YAxis className="fill-muted-foreground" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "13px",
                        }}
                        formatter={(value: number) => [value.toLocaleString("pt-BR"), "Alunos"]}
                      />
                      <Bar dataKey="alunos" radius={[6, 6, 0, 0]}>
                        {chartData.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Export Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Exportar Relatório
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de Relatório</Label>
                  <Select value={exportType} onValueChange={(v) => setExportType(v as typeof exportType)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="students">
                        <span className="flex items-center gap-2">
                          <GraduationCap className="h-4 w-4" />
                          Alunos
                        </span>
                      </SelectItem>
                      <SelectItem value="attendance">
                        <span className="flex items-center gap-2">
                          <ClipboardCheck className="h-4 w-4" />
                          Frequência
                        </span>
                      </SelectItem>
                      <SelectItem value="schools">
                        <span className="flex items-center gap-2">
                          <School className="h-4 w-4" />
                          Escolas
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Formato</Label>
                  <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as typeof exportFormat)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                      <SelectItem value="pdf">PDF (.pdf)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full"
                  onClick={handleExport}
                  disabled={exporting}
                >
                  {exporting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Exportando...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Exportar
                    </>
                  )}
                </Button>

                {/* Quick Stats */}
                <div className="pt-4 border-t space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Resumo Rápido
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Users className="h-3.5 w-3.5" />
                        Total de Alunos
                      </span>
                      <span className="font-semibold">
                        {loading ? (
                          <Skeleton className="h-4 w-8 inline-block" />
                        ) : (
                          data?.students.total.toLocaleString("pt-BR") ?? 0
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <School className="h-3.5 w-3.5" />
                        Total de Escolas
                      </span>
                      <span className="font-semibold">
                        {loading ? (
                          <Skeleton className="h-4 w-8 inline-block" />
                        ) : (
                          data?.schools.total.toLocaleString("pt-BR") ?? 0
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Presentes Hoje
                      </span>
                      <span className="font-semibold">
                        {loading ? (
                          <Skeleton className="h-4 w-8 inline-block" />
                        ) : (
                          data?.attendance.today.present.toLocaleString("pt-BR") ?? 0
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── INDIVIDUAL TAB ─── */}
        {canViewIndividual && (
          <TabsContent value="individual" className="space-y-6">
            {/* Student Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Relatório Individual do Aluno
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <Label>Buscar Aluno</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por nome, CPF ou RG..."
                        value={studentSearch}
                        onChange={(e) => {
                          setStudentSearch(e.target.value);
                          setSelectedStudentId("");
                          setStudentReport(null);
                        }}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleGenerateReport}
                      disabled={!selectedStudentId || loadingReport}
                    >
                      {loadingReport ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Gerando...
                        </>
                      ) : (
                        <>
                          <FileText className="mr-2 h-4 w-4" />
                          Gerar Relatório
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Student Search Results */}
                {studentSearch && !selectedStudentId && (
                  <div className="border rounded-lg max-h-48 overflow-y-auto">
                    {loadingStudents ? (
                      <div className="p-4 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Buscando alunos...
                      </div>
                    ) : studentOptions.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground text-sm">
                        Nenhum aluno encontrado
                      </div>
                    ) : (
                      studentOptions.map((s) => (
                        <button
                          key={s.id}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors border-b last:border-b-0"
                          onClick={() => {
                            setSelectedStudentId(s.id);
                            setStudentSearch(s.full_name);
                            setStudentReport(null);
                          }}
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={s.photo || undefined} alt={s.full_name} />
                            <AvatarFallback className="text-xs">
                              {getInitials(s.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{s.full_name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {s.school.name}
                              {s.grade ? ` • ${s.grade}` : ""}
                              {s.class ? ` • ${s.class}` : ""}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {/* Selected student indicator */}
                {selectedStudentId && studentOptions.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      Aluno selecionado: <strong>{studentOptions.find((s) => s.id === selectedStudentId)?.full_name || studentSearch}</strong>
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Loading Report */}
            {loadingReport && (
              <div className="space-y-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      <p className="text-muted-foreground text-sm">Gerando relatório...</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Report Results */}
            {studentReport && !loadingReport && (
              <div className="space-y-6">
                {/* Student Card */}
                <Card>
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row gap-6">
                      <Avatar className="h-20 w-20 mx-auto sm:mx-0">
                        <AvatarImage
                          src={studentReport.student.photo || undefined}
                          alt={studentReport.student.full_name}
                        />
                        <AvatarFallback className="text-xl">
                          {getInitials(studentReport.student.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-3 text-center sm:text-left">
                        <div>
                          <h3 className="text-xl font-bold">{studentReport.student.full_name}</h3>
                          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-1">
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                              {studentReport.student.status === "active" ? "Ativo" : "Inativo"}
                            </Badge>
                            {studentReport.student.cpf && (
                              <span className="text-sm text-muted-foreground">CPF: {studentReport.student.cpf}</span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                          {studentReport.student.grade && (
                            <div>
                              <span className="text-muted-foreground">Série: </span>
                              <span className="font-medium">{studentReport.student.grade}</span>
                            </div>
                          )}
                          {studentReport.student.class && (
                            <div>
                              <span className="text-muted-foreground">Turma: </span>
                              <span className="font-medium">{studentReport.student.class}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-muted-foreground">Escola: </span>
                            <span className="font-medium">{studentReport.school.name}</span>
                          </div>
                          {studentReport.student.date_of_birth && (
                            <div>
                              <span className="text-muted-foreground">Nascimento: </span>
                              <span className="font-medium">{formatDate(studentReport.student.date_of_birth)}</span>
                            </div>
                          )}
                          {studentReport.student.phone && (
                            <div>
                              <span className="text-muted-foreground">Telefone: </span>
                              <span className="font-medium">{studentReport.student.phone}</span>
                            </div>
                          )}
                          {studentReport.student.guardian_name && (
                            <div>
                              <span className="text-muted-foreground">Responsável: </span>
                              <span className="font-medium">{studentReport.student.guardian_name}</span>
                            </div>
                          )}
                          {studentReport.student.blood_type && (
                            <div>
                              <span className="text-muted-foreground">Tipo Sanguíneo: </span>
                              <span className="font-medium">{studentReport.student.blood_type}</span>
                            </div>
                          )}
                          {studentReport.student.special_needs && (
                            <div>
                              <span className="text-muted-foreground">Necessidades Especiais: </span>
                              <span className="font-medium">{studentReport.student.special_needs}</span>
                            </div>
                          )}
                          {studentReport.school.director_name && (
                            <div>
                              <span className="text-muted-foreground">Diretor(a): </span>
                              <span className="font-medium">{studentReport.school.director_name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Attendance Summary Cards */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total de Eventos
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold tracking-tight">
                        {studentReport.attendance_summary.total_events}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        eventos participados
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Presenças
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                        {studentReport.attendance_summary.attended_count}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        de {studentReport.attendance_summary.total_events} eventos
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Taxa de Frequência
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-3xl font-bold tracking-tight">
                        {studentReport.attendance_summary.attendance_rate}%
                      </p>
                      <Progress
                        value={studentReport.attendance_summary.attendance_rate}
                        className="h-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        {studentReport.attendance_summary.attended_count} presentes • {studentReport.attendance_summary.absent_count} ausentes
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Events Table */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Eventos Participados
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportIndividual}
                      disabled={exportingIndividual}
                    >
                      {exportingIndividual ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Exportando...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Exportar PDF
                        </>
                      )}
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    {studentReport.events.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Calendar className="h-10 w-10 mb-3" />
                        <p className="text-sm">Nenhum evento participado</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Evento</TableHead>
                            <TableHead>Data</TableHead>
                            <TableHead>Local</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-center">Presença</TableHead>
                            <TableHead>Observações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {studentReport.events.map((event) => (
                            <TableRow key={event.id}>
                              <TableCell className="font-medium">
                                {event.title}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {formatDateTime(event.date)}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {event.location || "—"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={eventStatusBadgeClass[event.status] || ""}
                                >
                                  {eventStatusLabels[event.status] || event.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                {event.attended ? (
                                  <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                                ) : (
                                  <XCircle className="h-5 w-5 text-red-400 mx-auto" />
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                                {event.notes || "—"}
                              </TableCell>
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
