"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  GraduationCap,
  School,
  ClipboardCheck,
  UserCheck,
  UserX,
  BarChart3,
  TrendingUp,
} from "lucide-react";

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

  const statCards = [
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
      title: "Total de Escolas",
      value: data?.schools.total ?? 0,
      icon: School,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/50",
    },
    {
      title: "Frequência Hoje",
      value: data?.attendance.today.present ?? 0,
      icon: ClipboardCheck,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-950/50",
    },
  ];

  const attendancePercentage = (present: number, total: number) =>
    total > 0 ? Math.round((present / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Olá, {firstName}! 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Bem-vindo(a) ao painel de gestão escolar. Aqui está um resumo geral.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
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

      {/* Second row: Students overview + Attendance */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Students Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Visão Geral dos Alunos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <>
                {/* Active vs Inactive */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                      Ativos
                    </span>
                    <span className="font-medium">{data?.students.active ?? 0}</span>
                  </div>
                  <Progress
                    value={data?.students.total ? (data.students.active / data.students.total) * 100 : 0}
                    className="h-2"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1.5">
                      <UserX className="h-3.5 w-3.5 text-red-500" />
                      Inativos
                    </span>
                    <span className="font-medium">{data?.students.inactive ?? 0}</span>
                  </div>
                  <Progress
                    value={data?.students.total ? (data.students.inactive / data.students.total) * 100 : 0}
                    className="h-2"
                  />
                </div>

                {/* Students per school */}
                <div className="pt-2 border-t">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                    Alunos por Escola
                  </h4>
                  {(data?.students.per_school.length ?? 0) > 0 ? (
                    <div className="space-y-2">
                      {data?.students.per_school.slice(0, 5).map((school) => (
                        <div key={school.id} className="flex items-center justify-between text-sm">
                          <span className="truncate max-w-[60%]">{school.name}</span>
                          <span className="font-medium text-primary">{school.student_count}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhuma escola cadastrada</p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Attendance Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Resumo de Frequência
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <>
                {/* Today */}
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Hoje</span>
                    <span className="text-xs text-muted-foreground">
                      {attendancePercentage(data?.attendance.today.present ?? 0, data?.attendance.today.total ?? 0)}%
                    </span>
                  </div>
                  <Progress
                    value={attendancePercentage(data?.attendance.today.present ?? 0, data?.attendance.today.total ?? 0)}
                    className="h-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="text-emerald-600">Presentes: {data?.attendance.today.present ?? 0}</span>
                    <span className="text-red-600">Ausentes: {data?.attendance.today.absent ?? 0}</span>
                  </div>
                </div>

                {/* This week */}
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Esta Semana</span>
                    <span className="text-xs text-muted-foreground">
                      {attendancePercentage(data?.attendance.this_week.present ?? 0, data?.attendance.this_week.total ?? 0)}%
                    </span>
                  </div>
                  <Progress
                    value={attendancePercentage(data?.attendance.this_week.present ?? 0, data?.attendance.this_week.total ?? 0)}
                    className="h-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="text-emerald-600">Presentes: {data?.attendance.this_week.present ?? 0}</span>
                    <span className="text-red-600">Ausentes: {data?.attendance.this_week.absent ?? 0}</span>
                  </div>
                </div>

                {/* This month */}
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Este Mês</span>
                    <span className="text-xs text-muted-foreground">
                      {attendancePercentage(data?.attendance.this_month.present ?? 0, data?.attendance.this_month.total ?? 0)}%
                    </span>
                  </div>
                  <Progress
                    value={attendancePercentage(data?.attendance.this_month.present ?? 0, data?.attendance.this_month.total ?? 0)}
                    className="h-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="text-emerald-600">Presentes: {data?.attendance.this_month.present ?? 0}</span>
                    <span className="text-red-600">Ausentes: {data?.attendance.this_month.absent ?? 0}</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
