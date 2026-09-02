"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, TrendingDown, Minus, CalendarDays, FileText,
  CheckSquare, AlertTriangle, BarChart3,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MetricComparison {
  current: number | null;
  previous: number | null;
  variation: number | null;
  unit: "percentage_points" | "count";
  insufficientData: boolean;
}

interface ComparisonData {
  metrics: {
    attendance: MetricComparison;
    events: MetricComparison;
    documents: MetricComparison;
    tasks: MetricComparison;
    dropoutAlerts: MetricComparison;
  };
}

// ─── Helper: format variation ───────────────────────────────────────────────

function formatVariation(
  variation: number | null,
  unit: string,
  insufficientData: boolean
): { text: string; color: string; icon: React.ElementType } {
  if (insufficientData || variation === null) {
    return { text: "Sem dados", color: "text-muted-foreground", icon: Minus };
  }

  const isPositive = variation > 0;
  const isNegative = variation < 0;
  const isNeutral = variation === 0;

  if (unit === "percentage_points") {
    const sign = isPositive ? "+" : "";
    return {
      text: `${sign}${variation} p.p.`,
      color: isPositive ? "text-emerald-600" : isNegative ? "text-red-600" : "text-muted-foreground",
      icon: isPositive ? TrendingUp : isNegative ? TrendingDown : Minus,
    };
  }

  // Count — show as percentage
  const sign = isPositive ? "+" : "";
  return {
    text: `${sign}${variation}%`,
    color: isPositive ? "text-emerald-600" : isNegative ? "text-red-600" : "text-muted-foreground",
    icon: isPositive ? TrendingUp : isNegative ? TrendingDown : Minus,
  };
}

function formatValue(value: number | null, unit: string, insufficientData: boolean): string {
  if (insufficientData || value === null) return "—";
  if (unit === "percentage_points") return `${value}%`;
  return value.toLocaleString("pt-BR");
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DashboardComparison() {
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchComparison() {
      try {
        setLoading(true);
        const result = await api.get<ComparisonData>("/dashboard/comparison");
        setData(result);
      } catch {
        // Comparison data is optional — don't crash the dashboard
      } finally {
        setLoading(false);
      }
    }
    fetchComparison();
  }, []);

  const metrics = data?.metrics;

  const cards = [
    {
      label: "Frequência",
      icon: BarChart3,
      current: metrics?.attendance?.current ?? null,
      previous: metrics?.attendance?.previous ?? null,
      variationInfo: formatVariation(
        metrics?.attendance?.variation ?? null,
        metrics?.attendance?.unit ?? "percentage_points",
        metrics?.attendance?.insufficientData ?? true
      ),
      currentText: formatValue(
        metrics?.attendance?.current ?? null,
        metrics?.attendance?.unit ?? "percentage_points",
        metrics?.attendance?.insufficientData ?? true
      ),
      previousText: formatValue(
        metrics?.attendance?.previous ?? null,
        metrics?.attendance?.unit ?? "percentage_points",
        metrics?.attendance?.insufficientData ?? true
      ),
    },
    {
      label: "Eventos",
      icon: CalendarDays,
      current: metrics?.events?.current ?? null,
      previous: metrics?.events?.previous ?? null,
      variationInfo: formatVariation(
        metrics?.events?.variation ?? null,
        metrics?.events?.unit ?? "count",
        false
      ),
      currentText: formatValue(metrics?.events?.current ?? null, "count", false),
      previousText: formatValue(metrics?.events?.previous ?? null, "count", false),
    },
    {
      label: "Documentos",
      icon: FileText,
      current: metrics?.documents?.current ?? null,
      previous: metrics?.documents?.previous ?? null,
      variationInfo: formatVariation(
        metrics?.documents?.variation ?? null,
        metrics?.documents?.unit ?? "count",
        false
      ),
      currentText: formatValue(metrics?.documents?.current ?? null, "count", false),
      previousText: formatValue(metrics?.documents?.previous ?? null, "count", false),
    },
    {
      label: "Tarefas",
      icon: CheckSquare,
      current: metrics?.tasks?.current ?? null,
      previous: metrics?.tasks?.previous ?? null,
      variationInfo: formatVariation(
        metrics?.tasks?.variation ?? null,
        metrics?.tasks?.unit ?? "count",
        false
      ),
      currentText: formatValue(metrics?.tasks?.current ?? null, "count", false),
      previousText: formatValue(metrics?.tasks?.previous ?? null, "count", false),
    },
    {
      label: "Alertas de Evasão",
      icon: AlertTriangle,
      current: metrics?.dropoutAlerts?.current ?? null,
      previous: metrics?.dropoutAlerts?.previous ?? null,
      variationInfo: formatVariation(
        metrics?.dropoutAlerts?.variation ?? null,
        metrics?.dropoutAlerts?.unit ?? "count",
        false
      ),
      currentText: formatValue(metrics?.dropoutAlerts?.current ?? null, "count", false),
      previousText: formatValue(metrics?.dropoutAlerts?.previous ?? null, "count", false),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          Comparação Temporal
        </h2>
        <span className="text-xs text-muted-foreground">
          Este mês vs mês anterior
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          const VarIcon = card.variationInfo.icon;
          return (
            <Card key={card.label} className="border-border/70">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {card.label}
                  </span>
                  <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
                </div>

                {loading ? (
                  <Skeleton className="h-7 w-16 mb-1" />
                ) : (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-semibold tracking-tight text-foreground tabular-nums">
                      {card.currentText}
                    </span>
                    <span className={`text-xs font-medium flex items-center gap-0.5 ${card.variationInfo.color}`}>
                      <VarIcon className="h-3 w-3" />
                      {card.variationInfo.text}
                    </span>
                  </div>
                )}

                <p className="mt-1 text-xs text-muted-foreground/70">
                  Mês anterior: {loading ? "—" : card.previousText}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
