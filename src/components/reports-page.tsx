"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportType, setExportType] = useState<"students" | "attendance" | "schools">("students");
  const [exportFormat, setExportFormat] = useState<"excel" | "pdf">("excel");
  const [exporting, setExporting] = useState(false);

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
    </div>
  );
}
