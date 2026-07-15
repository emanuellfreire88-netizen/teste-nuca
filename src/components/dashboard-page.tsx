"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GraduationCap,
  School,
  ClipboardCheck,
  UserCheck,
  Users,
  CalendarDays,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
  ArrowRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";

interface ReportData {
  students: {
    total: number;
    active: number;
    inactive: number;
    per_school: { id: string; name: string; student_count: number }[];
  };
  schools: {
    total: number;
  };
  attendance: {
    today: { present: number; absent: number; total: number };
    this_week: { present: number; absent: number; total: number };
    this_month: { present: number; absent: number; total: number };
  };
}

interface DropoutDashboardData {
  total_at_risk: number;
  high_risk_count: number;
  medium_risk_count: number;
  recovered_count: number;
  average_attendance: number;
  risk_distribution_by_month: { period: string; low: number; attention: number; medium: number; high: number }[];
}

// ===== Restrained palette — single accent color, neutrals for the rest =====
const ACCENT = "var(--primary)";
const MUTED = "var(--muted-foreground)";
const MUTED_SOFT = "var(--muted)";
const BORDER = "var(--border)";
const FOREGROUND = "var(--foreground)";
const SUCCESS = "#16a34a";
const DANGER = "#dc2626";
const WARNING = "#f97316";
const ATTENTION = "#eab308";

const attendancePercentage = (present: number, total: number) =>
  total > 0 ? Math.round((present / total) * 100) : 0;

// ===== Compact, professional tooltip =====
function TooltipBox({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 shadow-md text-xs">
      {label && (
        <p className="font-medium text-foreground mb-0.5">{label}</p>
      )}
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: entry.color || entry.fill }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium text-foreground">
            {entry.value.toLocaleString("pt-BR")}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<ReportData | null>(null);
  const [dropoutData, setDropoutData] = useState<DropoutDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dropoutLoading, setDropoutLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const result = await api.get<ReportData>("/reports");
        setData(result);
      } catch {
        setData({
          students: { total: 0, active: 0, inactive: 0, per_school: [] },
          schools: { total: 0 },
          attendance: {
            today: { present: 0, absent: 0, total: 0 },
            this_week: { present: 0, absent: 0, total: 0 },
            this_month: { present: 0, absent: 0, total: 0 },
          },
        });
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    async function fetchDropoutData() {
      try {
        setDropoutLoading(true);
        const result = await api.get<DropoutDashboardData>("/dropout/dashboard");
        setDropoutData(result);
      } catch {
        // Dropout data is optional - may not exist yet
        setDropoutData({
          total_at_risk: 0,
          high_risk_count: 0,
          medium_risk_count: 0,
          recovered_count: 0,
          average_attendance: 0,
          risk_distribution_by_month: [],
        });
      } finally {
        setDropoutLoading(false);
      }
    }
    fetchDropoutData();
  }, []);

  const firstName = user?.full_name?.split(" ")[0] || "Usuário";

  // ===== Derived chart data =====
  const statusData = useMemo(
    () => [
      { name: "Ativos", value: data?.students.active ?? 0, color: SUCCESS },
      { name: "Inativos", value: data?.students.inactive ?? 0, color: DANGER },
    ],
    [data]
  );

  const schoolsData = useMemo(
    () =>
      (data?.students.per_school ?? [])
        .map((s) => ({ name: s.name, value: s.student_count }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [data]
  );

  const attendanceData = useMemo(
    () => [
      {
        name: "Hoje",
        Presentes: data?.attendance.today.present ?? 0,
        Ausentes: data?.attendance.today.absent ?? 0,
        taxa: attendancePercentage(
          data?.attendance.today.present ?? 0,
          data?.attendance.today.total ?? 0
        ),
      },
      {
        name: "Semana",
        Presentes: data?.attendance.this_week.present ?? 0,
        Ausentes: data?.attendance.this_week.absent ?? 0,
        taxa: attendancePercentage(
          data?.attendance.this_week.present ?? 0,
          data?.attendance.this_week.total ?? 0
        ),
      },
      {
        name: "Mês",
        Presentes: data?.attendance.this_month.present ?? 0,
        Ausentes: data?.attendance.this_week.absent ?? 0,
        taxa: attendancePercentage(
          data?.attendance.this_month.present ?? 0,
          data?.attendance.this_month.total ?? 0
        ),
      },
    ],
    [data]
  );

  // Risk distribution chart data
  const riskChartData = useMemo(() => {
    const months = dropoutData?.risk_distribution_by_month ?? [];
    return months.map((m) => ({
      month: m.period,
      Baixo: m.low,
      Atenção: m.attention,
      Médio: m.medium,
      Alto: m.high,
    }));
  }, [dropoutData]);

  const activePct = attendancePercentage(
    data?.students.active ?? 0,
    data?.students.total ?? 0
  );
  const todayPct = attendancePercentage(
    data?.attendance.today.present ?? 0,
    data?.attendance.today.total ?? 0
  );

  const stats = [
    {
      label: "Alunos",
      value: data?.students.total ?? 0,
      sub: `${data?.schools.total ?? 0} escolas`,
      icon: GraduationCap,
    },
    {
      label: "Ativos",
      value: data?.students.active ?? 0,
      sub: `${activePct}% do total`,
      icon: UserCheck,
    },
    {
      label: "Escolas",
      value: data?.schools.total ?? 0,
      sub: "cadastradas",
      icon: School,
    },
    {
      label: "Frequência hoje",
      value: todayPct,
      suffix: "%",
      sub: `${data?.attendance.today.present ?? 0} presentes`,
      icon: ClipboardCheck,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ===== Page header ===== */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Visão geral
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Olá, {firstName}. Resumo geral da plataforma.
        </p>
      </div>

      {/* ===== Stats row ===== */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="border-border/70">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-muted-foreground">
                    {s.label}
                  </span>
                  <Icon className="h-4 w-4 text-muted-foreground/60" />
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  {loading ? (
                    <Skeleton className="h-7 w-16" />
                  ) : (
                    <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                      {s.value.toLocaleString("pt-BR")}
                      {s.suffix || ""}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground/80">
                  {s.sub}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ===== Dropout Risk Summary Row ===== */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/70">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-muted-foreground">
                Em Risco
              </span>
              <AlertTriangle className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              {dropoutLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                  {dropoutData?.total_at_risk ?? 0}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground/80">
              adolescentes identificados
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-muted-foreground">
                Alto Risco
              </span>
              <ShieldAlert className="h-4 w-4 text-red-500/70" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              {dropoutLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <>
                  <span className="text-2xl font-semibold tracking-tight text-red-600 dark:text-red-400 tabular-nums">
                    {dropoutData?.high_risk_count ?? 0}
                  </span>
                  {(dropoutData?.high_risk_count ?? 0) > 0 && (
                    <Badge variant="outline" className="text-[10px] border-red-200 text-red-600 dark:border-red-800 dark:text-red-400 bg-red-50 dark:bg-red-950/30">
                      Urgente
                    </Badge>
                  )}
                </>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground/80">
              necessitam atenção imediata
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-muted-foreground">
                Médio Risco
              </span>
              <AlertTriangle className="h-4 w-4 text-orange-500/70" />
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              {dropoutLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <span className="text-2xl font-semibold tracking-tight text-orange-600 dark:text-orange-400 tabular-nums">
                  {dropoutData?.medium_risk_count ?? 0}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground/80">
              em acompanhamento
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-muted-foreground">
                Recuperados
              </span>
              <ShieldCheck className="h-4 w-4 text-green-500/70" />
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              {dropoutLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <span className="text-2xl font-semibold tracking-tight text-green-600 dark:text-green-400 tabular-nums">
                  {dropoutData?.recovered_count ?? 0}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground/80">
              retornaram às atividades
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ===== Row 1: Donut + Schools bar ===== */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Donut: Status */}
        <Card className="lg:col-span-2 border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground/70" />
              Status dos alunos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (
              <div className="relative">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={88}
                      paddingAngle={2}
                      stroke="none"
                      startAngle={90}
                      endAngle={-270}
                    >
                      <Cell fill={SUCCESS} />
                      <Cell fill={DANGER} />
                    </Pie>
                    <Tooltip content={<TooltipBox />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-semibold tabular-nums text-foreground">
                    {(data?.students.total ?? 0).toLocaleString("pt-BR")}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Total
                  </span>
                </div>
                {/* Legend */}
                <div className="mt-2 flex items-center justify-center gap-5">
                  {statusData.map((s) => (
                    <div key={s.name} className="flex items-center gap-1.5 text-xs">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-muted-foreground">{s.name}</span>
                      <span className="font-medium text-foreground tabular-nums">
                        {s.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bar: Students per school */}
        <Card className="lg:col-span-3 border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <School className="h-4 w-4 text-muted-foreground/70" />
              Alunos por escola
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : schoolsData.length === 0 ? (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                Nenhuma escola cadastrada
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={schoolsData}
                  layout="vertical"
                  margin={{ top: 0, right: 28, left: 0, bottom: 0 }}
                  barCategoryGap={10}
                >
                  <CartesianGrid
                    horizontal={false}
                    strokeDasharray="3 3"
                    stroke={BORDER}
                    opacity={0.6}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: MUTED }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: MUTED }}
                    axisLine={false}
                    tickLine={false}
                    width={110}
                    tickFormatter={(v: string) =>
                      v.length > 16 ? v.slice(0, 14) + "…" : v
                    }
                  />
                  <Tooltip
                    content={<TooltipBox />}
                    cursor={{ fill: MUTED_SOFT, opacity: 0.4 }}
                  />
                  <Bar
                    dataKey="value"
                    name="Alunos"
                    fill={ACCENT}
                    radius={[0, 4, 4, 0]}
                    animationDuration={600}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ===== Row 2: Attendance ===== */}
      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground/70" />
              Resumo de frequência
            </CardTitle>
            {/* Period badges */}
            <div className="flex flex-wrap gap-2">
              {attendanceData.map((item) => (
                <div
                  key={item.name}
                  className="rounded-md border border-border/70 bg-muted/40 px-2.5 py-1"
                >
                  <div className="text-[10px] text-muted-foreground">
                    {item.name}
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-foreground">
                    {item.taxa}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart
                data={attendanceData}
                margin={{ top: 12, right: 12, left: -12, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="grad-present" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SUCCESS} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={SUCCESS} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-absent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={DANGER} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={DANGER} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={BORDER}
                  opacity={0.6}
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: MUTED }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: MUTED }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={<TooltipBox />}
                  cursor={{ stroke: BORDER, strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="Presentes"
                  stroke={SUCCESS}
                  strokeWidth={2}
                  fill="url(#grad-present)"
                  animationDuration={600}
                  dot={{ r: 3, fill: SUCCESS, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
                <Area
                  type="monotone"
                  dataKey="Ausentes"
                  stroke={DANGER}
                  strokeWidth={2}
                  fill="url(#grad-absent)"
                  animationDuration={600}
                  dot={{ r: 3, fill: DANGER, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
          {/* Legend */}
          <div className="mt-3 flex items-center justify-center gap-5">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: SUCCESS }} />
              <span className="text-muted-foreground">Presentes</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: DANGER }} />
              <span className="text-muted-foreground">Ausentes</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== Row 3: Risk Evolution + Quick Actions ===== */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Risk Evolution Chart */}
        <Card className="lg:col-span-3 border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground/70" />
              Evolução de Risco de Evasão
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dropoutLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : riskChartData.length === 0 ? (
              <div className="flex h-[220px] flex-col items-center justify-center text-sm text-muted-foreground gap-3">
                <AlertTriangle className="h-8 w-8 text-muted-foreground/30" />
                <p>Nenhuma avaliação de risco calculada ainda</p>
                <p className="text-xs text-muted-foreground/60">
                  Acesse &quot;Evasão&quot; no menu para calcular os riscos
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={riskChartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} opacity={0.4} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TooltipBox />} />
                  <Area type="monotone" dataKey="Baixo" stackId="1" stroke={SUCCESS} fill={SUCCESS} fillOpacity={0.5} />
                  <Area type="monotone" dataKey="Atenção" stackId="1" stroke={ATTENTION} fill={ATTENTION} fillOpacity={0.5} />
                  <Area type="monotone" dataKey="Médio" stackId="1" stroke={WARNING} fill={WARNING} fillOpacity={0.5} />
                  <Area type="monotone" dataKey="Alto" stackId="1" stroke={DANGER} fill={DANGER} fillOpacity={0.5} />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {/* Legend */}
            {riskChartData.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-4">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: SUCCESS }} />
                  <span className="text-muted-foreground">Baixo</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: ATTENTION }} />
                  <span className="text-muted-foreground">Atenção</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: WARNING }} />
                  <span className="text-muted-foreground">Médio</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: DANGER }} />
                  <span className="text-muted-foreground">Alto</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Info Cards */}
        <Card className="lg:col-span-2 border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-muted-foreground/70" />
              Informações Rápidas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Average Attendance */}
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Frequência Média Geral</span>
                <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground/50" />
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                {dropoutLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <span className="text-xl font-semibold tabular-nums text-foreground">
                    {Math.round(dropoutData?.average_attendance ?? 0)}%
                  </span>
                )}
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(dropoutData?.average_attendance ?? 0, 100)}%`,
                    backgroundColor: (dropoutData?.average_attendance ?? 0) >= 70 ? SUCCESS : (dropoutData?.average_attendance ?? 0) >= 50 ? WARNING : DANGER,
                  }}
                />
              </div>
            </div>

            {/* High Risk Alert */}
            {(dropoutData?.high_risk_count ?? 0) > 0 && (
              <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-500 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-red-700 dark:text-red-400">
                      Atenção: {dropoutData?.high_risk_count} aluno(s) em alto risco
                    </p>
                    <p className="text-[11px] text-red-600/70 dark:text-red-400/60 mt-0.5">
                      Acesse a página de Evasão para acompanhar
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Quick link to Dropout page */}
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => {
                // Navigate to dropout page using the global page navigation
                const event = new CustomEvent('navigate', { detail: 'dropout' });
                window.dispatchEvent(event);
              }}
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Ver Detecção de Evasão
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
