"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GraduationCap,
  School,
  ClipboardCheck,
  UserCheck,
  TrendingUp,
  TrendingDown,
  Users,
  CalendarDays,
  Activity,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
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
  LabelList,
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

// ===== Modern Color Palette =====
const CHART_COLORS = {
  emerald: "#10b981",
  emeraldSoft: "#34d399",
  red: "#ef4444",
  redSoft: "#f87171",
  amber: "#f59e0b",
  amberSoft: "#fbbf24",
  purple: "#8b5cf6",
  purpleSoft: "#a78bfa",
  blue: "#3b82f6",
  blueSoft: "#60a5fa",
  cyan: "#06b6d4",
  cyanSoft: "#22d3ee",
};

// Modern gradient palette for bars (rotating)
const SCHOOL_GRADIENTS = [
  { from: "#10b981", to: "#34d399" }, // emerald
  { from: "#3b82f6", to: "#60a5fa" }, // blue
  { from: "#8b5cf6", to: "#a78bfa" }, // purple
  { from: "#f59e0b", to: "#fbbf24" }, // amber
  { from: "#06b6d4", to: "#22d3ee" }, // cyan
  { from: "#ec4899", to: "#f472b6" }, // pink
];

const attendancePercentage = (present: number, total: number) =>
  total > 0 ? Math.round((present / total) * 100) : 0;

// ===== Custom Tooltip =====
function ModernTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-popover/95 px-3 py-2 shadow-xl backdrop-blur-md">
      {label && (
        <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
      )}
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex items-center gap-2 text-xs">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color || entry.fill }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold text-foreground">
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
  const [loading, setLoading] = useState(true);

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

  const firstName = user?.full_name?.split(" ")[0] || "Usuário";

  // ===== Derived chart data =====
  const statusData = useMemo(
    () => [
      {
        name: "Ativos",
        value: data?.students.active ?? 0,
        color: CHART_COLORS.emerald,
      },
      {
        name: "Inativos",
        value: data?.students.inactive ?? 0,
        color: CHART_COLORS.red,
      },
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
        Ausentes: data?.attendance.this_month.absent ?? 0,
        taxa: attendancePercentage(
          data?.attendance.this_month.present ?? 0,
          data?.attendance.this_month.total ?? 0
        ),
      },
    ],
    [data]
  );

  // ===== KPI cards config (modernized) =====
  const activePct = attendancePercentage(
    data?.students.active ?? 0,
    data?.students.total ?? 0
  );
  const todayPct = attendancePercentage(
    data?.attendance.today.present ?? 0,
    data?.attendance.today.total ?? 0
  );

  const statCards = [
    {
      title: "Total de Alunos",
      value: data?.students.total ?? 0,
      icon: GraduationCap,
      gradient: "from-blue-500/20 via-blue-500/10 to-transparent",
      iconBg: "from-blue-500 to-blue-600",
      sub: `${data?.schools.total ?? 0} escolas`,
      trend: "+8.2%",
      trendUp: true,
    },
    {
      title: "Alunos Ativos",
      value: data?.students.active ?? 0,
      icon: UserCheck,
      gradient: "from-emerald-500/20 via-emerald-500/10 to-transparent",
      iconBg: "from-emerald-500 to-emerald-600",
      sub: `${activePct}% do total`,
      trend: "+2.4%",
      trendUp: true,
    },
    {
      title: "Total de Escolas",
      value: data?.schools.total ?? 0,
      icon: School,
      gradient: "from-amber-500/20 via-amber-500/10 to-transparent",
      iconBg: "from-amber-500 to-amber-600",
      sub: "cadastradas",
      trend: "+1",
      trendUp: true,
    },
    {
      title: "Frequência Hoje",
      value: todayPct,
      suffix: "%",
      icon: ClipboardCheck,
      gradient: "from-purple-500/20 via-purple-500/10 to-transparent",
      iconBg: "from-purple-500 to-purple-600",
      sub: `${data?.attendance.today.present ?? 0} presentes`,
      trend: todayPct >= 75 ? "Boa" : "Atenção",
      trendUp: todayPct >= 75,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome header with subtle gradient accent */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-background p-6"
      >
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative">
          <h1 className="text-2xl font-bold tracking-tight">
            Olá, {firstName}! 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Bem-vindo(a) ao painel de gestão escolar. Aqui está um resumo geral.
          </p>
        </div>
      </motion.div>

      {/* ===== Modern KPI Cards ===== */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.08 }}
            >
              <Card
                className={`relative overflow-hidden border-border/60 bg-gradient-to-br ${card.gradient} transition-all hover:shadow-lg hover:-translate-y-0.5`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${card.iconBg} text-white shadow-md`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        card.trendUp
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {card.trendUp ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <Activity className="h-3 w-3" />
                      )}
                      {card.trend}
                    </div>
                  </div>
                  <div className="mt-4">
                    {loading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      <p className="text-3xl font-bold tracking-tight">
                        {card.value.toLocaleString("pt-BR")}
                        {card.suffix || ""}
                      </p>
                    )}
                    <p className="mt-1 text-sm font-medium text-foreground/80">
                      {card.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {card.sub}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* ===== Row 1: Donut chart + Schools bar chart ===== */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Donut: Active vs Inactive */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="lg:col-span-2"
        >
          <Card className="h-full border-border/60">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4 text-primary" />
                    Status dos Alunos
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    Distribuição ativos vs inativos
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[240px] w-full rounded-xl" />
              ) : (
                <div className="relative">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <defs>
                        <linearGradient
                          id="grad-emerald"
                          x1="0"
                          y1="0"
                          x2="1"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor={CHART_COLORS.emeraldSoft}
                          />
                          <stop
                            offset="100%"
                            stopColor={CHART_COLORS.emerald}
                          />
                        </linearGradient>
                        <linearGradient
                          id="grad-red"
                          x1="0"
                          y1="0"
                          x2="1"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={CHART_COLORS.redSoft} />
                          <stop offset="100%" stopColor={CHART_COLORS.red} />
                        </linearGradient>
                      </defs>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={62}
                        outerRadius={92}
                        paddingAngle={3}
                        cornerRadius={8}
                        startAngle={90}
                        endAngle={-270}
                      >
                        <Cell fill="url(#grad-emerald)" stroke="none" />
                        <Cell fill="url(#grad-red)" stroke="none" />
                      </Pie>
                      <Tooltip
                        content={<ModernTooltip />}
                        cursor={{ stroke: "transparent" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label */}
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold tracking-tight">
                      {(data?.students.total ?? 0).toLocaleString("pt-BR")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Total
                    </span>
                  </div>
                  {/* Legend */}
                  <div className="mt-3 flex items-center justify-center gap-6">
                    {statusData.map((s) => (
                      <div
                        key={s.name}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="text-muted-foreground">{s.name}</span>
                        <span className="font-semibold">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Bar chart: Students per school */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="lg:col-span-3"
        >
          <Card className="h-full border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Alunos por Escola
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                Top {Math.min(schoolsData.length, 8)} escolas com mais alunos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[240px] w-full rounded-xl" />
              ) : schoolsData.length === 0 ? (
                <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                  Nenhuma escola cadastrada
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={schoolsData}
                    layout="vertical"
                    margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
                    barCategoryGap={12}
                  >
                    <defs>
                      {SCHOOL_GRADIENTS.map((g, i) => (
                        <linearGradient
                          key={i}
                          id={`grad-school-${i}`}
                          x1="0"
                          y1="0"
                          x2="1"
                          y2="0"
                        >
                          <stop offset="0%" stopColor={g.from} />
                          <stop offset="100%" stopColor={g.to} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid
                      horizontal={false}
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border) / 0.4)"
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      width={110}
                      tickFormatter={(v: string) =>
                        v.length > 16 ? v.slice(0, 14) + "…" : v
                      }
                    />
                    <Tooltip
                      content={<ModernTooltip />}
                      cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                    />
                    <Bar
                      dataKey="value"
                      name="Alunos"
                      radius={[0, 6, 6, 0]}
                      animationDuration={900}
                    >
                      {schoolsData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={`url(#grad-school-${i % SCHOOL_GRADIENTS.length})`}
                        />
                      ))}
                      <LabelList
                        dataKey="value"
                        position="right"
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          fill: "hsl(var(--foreground))",
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ===== Row 2: Attendance area chart ===== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
      >
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  Resumo de Frequência
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Presentes e ausentes por período
                </CardDescription>
              </div>
              {/* Mini KPI badges */}
              <div className="flex flex-wrap gap-2">
                {attendanceData.map((item) => (
                  <div
                    key={item.name}
                    className="rounded-lg border bg-muted/30 px-3 py-1.5 text-center"
                  >
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <CalendarDays className="h-3 w-3" />
                      {item.name}
                    </div>
                    <div className="text-sm font-bold text-foreground">
                      {item.taxa}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[260px] w-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart
                  data={attendanceData}
                  margin={{ top: 16, right: 16, left: -16, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="grad-present"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={CHART_COLORS.emerald}
                        stopOpacity={0.45}
                      />
                      <stop
                        offset="100%"
                        stopColor={CHART_COLORS.emerald}
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                    <linearGradient
                      id="grad-absent"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={CHART_COLORS.red}
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="100%"
                        stopColor={CHART_COLORS.red}
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border) / 0.4)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<ModernTooltip />}
                    cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Presentes"
                    stroke={CHART_COLORS.emerald}
                    strokeWidth={2.5}
                    fill="url(#grad-present)"
                    animationDuration={900}
                    dot={{
                      r: 4,
                      fill: CHART_COLORS.emerald,
                      strokeWidth: 2,
                      stroke: "hsl(var(--background))",
                    }}
                    activeDot={{ r: 6 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Ausentes"
                    stroke={CHART_COLORS.red}
                    strokeWidth={2.5}
                    fill="url(#grad-absent)"
                    animationDuration={900}
                    dot={{
                      r: 4,
                      fill: CHART_COLORS.red,
                      strokeWidth: 2,
                      stroke: "hsl(var(--background))",
                    }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {/* Legend */}
            <div className="mt-3 flex items-center justify-center gap-6">
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.emerald }} />
                <span className="text-muted-foreground">Presentes</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.red }} />
                <span className="text-muted-foreground">Ausentes</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
