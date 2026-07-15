'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle,
  Users,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  RefreshCw,
  Phone,
  Home,
  MessageSquare,
  UserCheck,
  ChevronDown,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────────

type RiskLevel = 'low' | 'attention' | 'medium' | 'high';
type ActionType = 'call' | 'contact_guardian' | 'home_visit' | 'conversation' | 'returned';

interface DashboardData {
  total_at_risk: number;
  high_risk_count: number;
  medium_risk_count: number;
  attention_count: number;
  low_risk_count: number;
  recovered_count: number;
  average_attendance: number;
  risk_distribution_by_month: {
    period: string;
    high: number;
    medium: number;
    attention: number;
    low: number;
  }[];
}

interface StudentRisk {
  id: string;
  full_name: string;
  photo: string | null;
  school: { id: string; name: string };
  risk_level: RiskLevel;
  score: number;
  reasons: string[];
  attendance_percentage: number | null;
  consecutive_absences: number | null;
  days_without_participation: number | null;
  calculated_at: string | null;
}

interface StudentsResponse {
  students: StudentRisk[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface SchoolOption {
  id: string;
  name: string;
}

interface StudentDetail {
  student: {
    id: string;
    full_name: string;
    photo: string | null;
    school: { id: string; name: string };
    class: string | null;
    grade: string | null;
    guardian_name: string | null;
    guardian_phone: string | null;
    guardian_email: string | null;
    status: string;
  };
  current_risk: {
    risk_level: RiskLevel;
    score: number;
    reasons: string[];
    attendance_percentage: number;
    consecutive_absences: number;
    days_without_participation: number;
    previous_risk_level: RiskLevel | null;
    calculated_at: string;
  } | null;
  risk_evolution: {
    id: string;
    risk_level: RiskLevel;
    score: number;
    reasons: string[];
    attendance_percentage: number;
    consecutive_absences: number;
    days_without_participation: number;
    previous_risk_level: RiskLevel | null;
    calculated_at: string;
  }[];
  follow_up_history: {
    id: string;
    action_type: ActionType;
    description: string | null;
    notes: string | null;
    responsible: { id: string; full_name: string };
    created_at: string;
  }[];
  attendance_history: {
    id: string;
    date: string;
    status: string;
  }[];
}

interface FollowUpResponse {
  follow_up: {
    id: string;
    action_type: ActionType;
    description: string | null;
    notes: string | null;
    responsible: { id: string; full_name: string };
    created_at: string;
  };
}

// ─── Constants ──────────────────────────────────────────────────────────────

const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'Baixo Risco',
  attention: 'Atenção',
  medium: 'Médio Risco',
  high: 'Alto Risco',
};

const RISK_BADGE_CLASSES: Record<RiskLevel, string> = {
  low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200',
  attention: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200',
  medium: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200',
  high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200',
};

const RISK_CHART_COLORS: Record<RiskLevel, string> = {
  low: '#16a34a',
  attention: '#eab308',
  medium: '#f97316',
  high: '#dc2626',
};

const RISK_NUMERIC: Record<RiskLevel, number> = {
  low: 1,
  attention: 2,
  medium: 3,
  high: 4,
};

const ACTION_LABELS: Record<ActionType, string> = {
  call: 'Ligação realizada',
  contact_guardian: 'Contato com responsável',
  home_visit: 'Visita domiciliar',
  conversation: 'Conversa realizada',
  returned: 'Retornou às atividades',
};

const ACTION_ICONS: Record<ActionType, React.ElementType> = {
  call: Phone,
  contact_guardian: Users,
  home_visit: Home,
  conversation: MessageSquare,
  returned: UserCheck,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatMonth(period: string): string {
  try {
    const [year, month] = period.split('-');
    const d = new Date(Number(year), Number(month) - 1);
    return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  } catch {
    return period;
  }
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <Badge
      variant="outline"
      className={`${RISK_BADGE_CLASSES[level]} text-xs font-semibold px-2 py-0.5`}
    >
      {RISK_LABELS[level]}
    </Badge>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  iconClass,
  badgeText,
  badgeClass,
  loading,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  iconClass: string;
  badgeText?: string;
  badgeClass?: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold">{value}</p>
                {badgeText && (
                  <Badge variant="outline" className={`text-xs ${badgeClass}`}>
                    {badgeText}
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className={`rounded-full p-3 ${iconClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md text-xs">
      {label && (
        <p className="font-medium text-foreground mb-1">{label}</p>
      )}
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: entry.color || entry.fill }}
          />
          <span className="text-muted-foreground">
            {RISK_LABELS[entry.dataKey as RiskLevel] || entry.dataKey}:
          </span>
          <span className="font-medium text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function StudentCard({
  student,
  onViewDetails,
  onFollowUp,
}: {
  student: StudentRisk;
  onViewDetails: (id: string) => void;
  onFollowUp: (student: StudentRisk) => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarImage src={student.photo || undefined} alt={student.full_name} />
            <AvatarFallback className="bg-muted text-muted-foreground text-sm font-semibold">
              {getInitials(student.full_name)}
            </AvatarFallback>
          </Avatar>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-foreground truncate">
                  {student.full_name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {student.school.name}
                </p>
              </div>
              <RiskBadge level={student.risk_level} />
            </div>

            {/* Reasons */}
            {student.reasons && student.reasons.length > 0 && (
              <div className="mt-3 space-y-1">
                {student.reasons.map((reason, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Metrics */}
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
              {student.attendance_percentage !== null && (
                <span>
                  Frequência{' '}
                  <span
                    className={
                      student.attendance_percentage < 70
                        ? 'text-red-500 font-medium'
                        : 'font-medium text-foreground'
                    }
                  >
                    {student.attendance_percentage}%
                  </span>
                </span>
              )}
              {student.days_without_participation !== null && (
                <span>
                  <span className="font-medium text-foreground">
                    {student.days_without_participation}
                  </span>{' '}
                  dias sem participar
                </span>
              )}
              {student.consecutive_absences !== null && student.consecutive_absences > 0 && (
                <span>
                  <span className="font-medium text-foreground">
                    {student.consecutive_absences}
                  </span>{' '}
                  faltas consecutivas
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewDetails(student.id)}
              >
                Ver Detalhes
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onFollowUp(student)}
                className="text-orange-600 border-orange-200 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:hover:bg-orange-950/30"
              >
                Registrar Acompanhamento
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StudentDetailDialog({
  studentId,
  open,
  onOpenChange,
  onFollowUpFromDetail,
}: {
  studentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFollowUpFromDetail: (student: { id: string; full_name: string; school: { id: string; name: string } }) => void;
}) {
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !studentId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await api.get<StudentDetail>(`/dropout/${studentId}`);
        if (!cancelled) setDetail(data);
      } catch {
        toast.error('Erro ao carregar detalhes do aluno');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, open]);

  // Risk evolution chart data
  const evolutionData = useMemo(() => {
    if (!detail?.risk_evolution?.length) return [];
    return [...detail.risk_evolution]
      .reverse()
      .map((e) => ({
        date: formatDate(e.calculated_at),
        risk: RISK_NUMERIC[e.risk_level] ?? 0,
        riskLabel: RISK_LABELS[e.risk_level],
        riskLevel: e.risk_level,
        score: e.score,
        attendance: e.attendance_percentage,
      }));
  }, [detail]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Detalhes do Aluno</DialogTitle>
          <DialogDescription>
            Informações detalhadas sobre o risco de evasão
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-14 w-14 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : detail ? (
          <ScrollArea className="max-h-[70vh] pr-1">
            <div className="space-y-6 p-1">
              {/* Student Header */}
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 shrink-0">
                  <AvatarImage
                    src={detail.student.photo || undefined}
                    alt={detail.student.full_name}
                  />
                  <AvatarFallback className="bg-muted text-muted-foreground text-lg font-semibold">
                    {getInitials(detail.student.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold truncate">
                    {detail.student.full_name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {detail.student.school.name}
                    {detail.student.class && ` • ${detail.student.class}`}
                    {detail.student.grade && ` • ${detail.student.grade}`}
                  </p>
                  {detail.current_risk && (
                    <div className="mt-1">
                      <RiskBadge level={detail.current_risk.risk_level} />
                    </div>
                  )}
                </div>
              </div>

              {/* Guardian Info */}
              {detail.student.guardian_name && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Responsável
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <p className="text-sm font-medium">{detail.student.guardian_name}</p>
                    {(detail.student.guardian_phone || detail.student.guardian_email) && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {detail.student.guardian_phone && detail.student.guardian_phone}
                        {detail.student.guardian_phone && detail.student.guardian_email && ' • '}
                        {detail.student.guardian_email && detail.student.guardian_email}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Current Risk Metrics */}
              {detail.current_risk && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Indicadores de Risco Atuais
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Pontuação</p>
                        <p className="text-lg font-bold">{detail.current_risk.score}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Frequência</p>
                        <p
                          className={`text-lg font-bold ${
                            detail.current_risk.attendance_percentage < 70
                              ? 'text-red-500'
                              : ''
                          }`}
                        >
                          {detail.current_risk.attendance_percentage}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Faltas consecutivas</p>
                        <p className="text-lg font-bold">
                          {detail.current_risk.consecutive_absences}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Dias sem participação</p>
                        <p className="text-lg font-bold">
                          {detail.current_risk.days_without_participation}
                        </p>
                      </div>
                    </div>
                    {detail.current_risk.reasons?.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {detail.current_risk.reasons.map((reason, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 text-sm text-muted-foreground"
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
                            <span>{reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Risk Evolution Chart */}
              {evolutionData.length > 1 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Evolução do Risco
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={evolutionData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 11 }}
                            stroke="var(--muted-foreground)"
                          />
                          <YAxis
                            domain={[0, 5]}
                            ticks={[1, 2, 3, 4]}
                            tickFormatter={(v: number) => {
                              const labels: Record<number, string> = {
                                1: 'Baixo',
                                2: 'Atenção',
                                3: 'Médio',
                                4: 'Alto',
                              };
                              return labels[v] || '';
                            }}
                            tick={{ fontSize: 10 }}
                            stroke="var(--muted-foreground)"
                            width={55}
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const item = payload[0]?.payload;
                              return (
                                <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md text-xs">
                                  <p className="font-medium text-foreground">{label}</p>
                                  <p className="text-muted-foreground">
                                    Nível: <span className="font-medium text-foreground">{item?.riskLabel}</span>
                                  </p>
                                  <p className="text-muted-foreground">
                                    Pontuação: <span className="font-medium text-foreground">{item?.score}</span>
                                  </p>
                                  {item?.attendance !== undefined && (
                                    <p className="text-muted-foreground">
                                      Frequência: <span className="font-medium text-foreground">{item.attendance}%</span>
                                    </p>
                                  )}
                                </div>
                              );
                            }}
                          />
                          <Area
                            type="stepAfter"
                            dataKey="risk"
                            stroke="#f97316"
                            fill="#f9731633"
                            strokeWidth={2}
                            dot={(props: any) => {
                              const { cx, cy, payload } = props;
                              const color =
                                RISK_CHART_COLORS[payload.riskLevel as RiskLevel] ||
                                '#f97316';
                              return (
                                <circle
                                  key={`dot-${payload.date}`}
                                  cx={cx}
                                  cy={cy}
                                  r={4}
                                  fill={color}
                                  stroke={color}
                                  strokeWidth={2}
                                />
                              );
                            }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Follow-up History */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Histórico de Acompanhamento
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onFollowUpFromDetail(detail.student)}
                      className="text-orange-600 border-orange-200 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:hover:bg-orange-950/30"
                    >
                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                      Novo Acompanhamento
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  {detail.follow_up_history?.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum acompanhamento registrado
                    </p>
                  ) : (
                    <ScrollArea className="max-h-64">
                      <div className="space-y-4">
                        {detail.follow_up_history.map((fu) => {
                          const ActionIcon = ACTION_ICONS[fu.action_type] || MessageSquare;
                          return (
                            <div key={fu.id} className="flex gap-3">
                              <div className="flex flex-col items-center">
                                <div className="rounded-full p-1.5 bg-muted">
                                  <ActionIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                                <div className="w-px flex-1 bg-border mt-1" />
                              </div>
                              <div className="flex-1 min-w-0 pb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">
                                    {ACTION_LABELS[fu.action_type]}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    📅 {formatDate(fu.created_at)}
                                  </span>
                                </div>
                                {fu.responsible && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    Responsável: {fu.responsible.full_name}
                                  </p>
                                )}
                                {fu.description && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {fu.description}
                                  </p>
                                )}
                                {fu.notes && (
                                  <p className="text-xs text-muted-foreground mt-1 italic">
                                    Obs: {fu.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FollowUpDialog({
  student,
  open,
  onOpenChange,
  onSuccess,
}: {
  student: StudentRisk | { id: string; full_name: string; school: { id: string; name: string } } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [actionType, setActionType] = useState<ActionType | ''>('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset form on open/close
  useEffect(() => {
    if (!open) {
      setActionType('');
      setDescription('');
      setNotes('');
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!student || !actionType) {
      toast.error('Preencha o tipo de ação');
      return;
    }
    try {
      setSubmitting(true);
      await api.post<FollowUpResponse>('/dropout/follow-ups', {
        student_id: student.id,
        action_type: actionType,
        description: description || null,
        notes: notes || null,
      });
      toast.success('Acompanhamento registrado com sucesso');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao registrar acompanhamento');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Acompanhamento</DialogTitle>
          <DialogDescription>
            {student
              ? `Registrar acompanhamento para ${student.full_name}`
              : 'Registrar acompanhamento'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="action-type">Tipo de Ação *</Label>
            <Select
              value={actionType}
              onValueChange={(v) => setActionType(v as ActionType)}
            >
              <SelectTrigger id="action-type">
                <SelectValue placeholder="Selecione o tipo de ação" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ACTION_LABELS).map(([key, label]) => {
                  const Icon = ACTION_ICONS[key as ActionType];
                  return (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        <span>{label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fu-description">Descrição</Label>
            <Textarea
              id="fu-description"
              placeholder="Descreva o que foi realizado..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fu-notes">Observações</Label>
            <Textarea
              id="fu-notes"
              placeholder="Observações adicionais..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!actionType || submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Loading Skeletons ──────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
              </div>
              <Skeleton className="h-12 w-12 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StudentListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start gap-4">
              <Skeleton className="h-12 w-12 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-56" />
                <div className="flex gap-2 mt-3">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-44" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function DropoutPage() {
  const user = useAuthStore((s) => s.user);

  // ── State ──
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [students, setStudents] = useState<StudentRisk[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [calculating, setCalculating] = useState(false);

  // Filters
  const [riskFilter, setRiskFilter] = useState<string>('');
  const [schoolFilter, setSchoolFilter] = useState<string>('');

  // Dialogs
  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [followUpStudent, setFollowUpStudent] = useState<StudentRisk | null>(null);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpFromDetailStudent, setFollowUpFromDetailStudent] = useState<{
    id: string;
    full_name: string;
    school: { id: string; name: string };
  } | null>(null);
  const [followUpFromDetailOpen, setFollowUpFromDetailOpen] = useState(false);

  // ── Data fetching ──

  const fetchDashboard = useCallback(async () => {
    try {
      setDashboardLoading(true);
      const params = new URLSearchParams();
      if (schoolFilter) params.set('school_id', schoolFilter);
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await api.get<DashboardData>(`/dropout/dashboard${query}`);
      setDashboard(data);
    } catch {
      toast.error('Erro ao carregar dados do painel');
    } finally {
      setDashboardLoading(false);
    }
  }, [schoolFilter]);

  const fetchStudents = useCallback(async () => {
    try {
      setStudentsLoading(true);
      const params = new URLSearchParams();
      if (riskFilter) params.set('risk_level', riskFilter);
      if (schoolFilter) params.set('school_id', schoolFilter);
      params.set('page', String(pagination.page));
      params.set('limit', '20');
      const data = await api.get<StudentsResponse>(
        `/dropout?${params.toString()}`
      );
      setStudents(data.students);
      setPagination(data.pagination);
    } catch {
      toast.error('Erro ao carregar lista de alunos');
    } finally {
      setStudentsLoading(false);
    }
  }, [riskFilter, schoolFilter, pagination.page]);

  const fetchSchools = useCallback(async () => {
    try {
      const data = await api.get<{ schools: SchoolOption[] }>(
        '/schools?limit=100'
      );
      setSchools(data.schools || []);
    } catch {
      // Silent — schools filter is optional
    }
  }, []);

  // ── Effects ──

  useEffect(() => {
    fetchSchools();
  }, [fetchSchools]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // ── Handlers ──

  const handleCalculateRisks = async () => {
    try {
      setCalculating(true);
      const result = await api.post<{
        message: string;
        assessments_created: number;
        notifications_created: number;
        total_students: number;
      }>('/dropout');
      toast.success(
        `${result.assessments_created} avaliações calculadas para ${result.total_students} alunos`
      );
      // Refresh data
      await Promise.all([fetchDashboard(), fetchStudents()]);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao calcular riscos');
    } finally {
      setCalculating(false);
    }
  };

  const handleViewDetails = (studentId: string) => {
    setDetailStudentId(studentId);
    setDetailOpen(true);
  };

  const handleFollowUp = (student: StudentRisk) => {
    setFollowUpStudent(student);
    setFollowUpOpen(true);
  };

  const handleFollowUpFromDetail = (
    student: { id: string; full_name: string; school: { id: string; name: string } }
  ) => {
    setFollowUpFromDetailStudent({
      id: student.id,
      full_name: student.full_name,
      school: student.school,
    });
    setFollowUpFromDetailOpen(true);
  };

  const handleFollowUpSuccess = () => {
    fetchStudents();
    // If detail dialog is open, we need to refresh it by changing the student id
    // This forces a re-fetch in the detail dialog
    if (detailStudentId) {
      setDetailStudentId(null);
      setTimeout(() => setDetailStudentId(detailStudentId), 50);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleRiskFilterChange = (value: string) => {
    setRiskFilter(value === 'all' ? '' : value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleSchoolFilterChange = (value: string) => {
    setSchoolFilter(value === 'all' ? '' : value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // ── Chart data ──

  const chartData = useMemo(() => {
    if (!dashboard?.risk_distribution_by_month) return [];
    return dashboard.risk_distribution_by_month.map((m) => ({
      month: formatMonth(m.period),
      low: m.low,
      attention: m.attention,
      medium: m.medium,
      high: m.high,
    }));
  }, [dashboard]);

  // ── Can calculate risks (Admin/Operator only) ──

  const canCalculate = user?.role === 'Admin' || user?.role === 'Operator';

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Detecção de Evasão
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Monitore alunos em risco de evasão e acompanhe as ações de
              retenção realizadas
            </p>
          </div>
          {canCalculate && (
            <Button
              onClick={handleCalculateRisks}
              disabled={calculating}
              className="shrink-0"
            >
              {calculating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Calcular Riscos
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="w-full sm:w-52">
            <Select
              value={riskFilter || 'all'}
              onValueChange={handleRiskFilterChange}
            >
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Nível de Risco" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os níveis</SelectItem>
                <SelectItem value="high">Alto Risco</SelectItem>
                <SelectItem value="medium">Médio Risco</SelectItem>
                <SelectItem value="attention">Atenção</SelectItem>
                <SelectItem value="low">Baixo Risco</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-52">
            <Select
              value={schoolFilter || 'all'}
              onValueChange={handleSchoolFilterChange}
            >
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Escola" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as escolas</SelectItem>
                {schools.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Dashboard Stats Row ── */}
      {dashboardLoading ? (
        <DashboardSkeleton />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total em Risco"
            value={dashboard?.total_at_risk ?? 0}
            icon={AlertTriangle}
            iconClass="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
            loading={false}
          />
          <StatCard
            title="Alto Risco"
            value={dashboard?.high_risk_count ?? 0}
            icon={ShieldAlert}
            iconClass="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            badgeText="Urgente"
            badgeClass="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
            loading={false}
          />
          <StatCard
            title="Médio Risco"
            value={dashboard?.medium_risk_count ?? 0}
            icon={TrendingUp}
            iconClass="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
            badgeText="Atenção"
            badgeClass="bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800"
            loading={false}
          />
          <StatCard
            title="Recuperados"
            value={dashboard?.recovered_count ?? 0}
            icon={ShieldCheck}
            iconClass="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            loading={false}
          />
        </div>
      )}

      {/* ── Risk Evolution Chart ── */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Evolução da Distribuição de Risco
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 10, bottom: 0, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    stroke="var(--muted-foreground)"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    stroke="var(--muted-foreground)"
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="low"
                    name="low"
                    stackId="1"
                    stroke={RISK_CHART_COLORS.low}
                    fill={RISK_CHART_COLORS.low}
                    fillOpacity={0.3}
                  />
                  <Area
                    type="monotone"
                    dataKey="attention"
                    name="attention"
                    stackId="1"
                    stroke={RISK_CHART_COLORS.attention}
                    fill={RISK_CHART_COLORS.attention}
                    fillOpacity={0.3}
                  />
                  <Area
                    type="monotone"
                    dataKey="medium"
                    name="medium"
                    stackId="1"
                    stroke={RISK_CHART_COLORS.medium}
                    fill={RISK_CHART_COLORS.medium}
                    fillOpacity={0.3}
                  />
                  <Area
                    type="monotone"
                    dataKey="high"
                    name="high"
                    stackId="1"
                    stroke={RISK_CHART_COLORS.high}
                    fill={RISK_CHART_COLORS.high}
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              {Object.entries(RISK_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="h-3 w-3 rounded-sm"
                    style={{
                      backgroundColor: RISK_CHART_COLORS[key as RiskLevel],
                    }}
                  />
                  <span className="text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Students at Risk List ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Alunos em Risco</h2>
          {!studentsLoading && pagination.total > 0 && (
            <span className="text-sm text-muted-foreground">
              {pagination.total} aluno{pagination.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {studentsLoading ? (
          <StudentListSkeleton />
        ) : students.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-sm font-medium text-foreground">
                Nenhum aluno encontrado
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {riskFilter || schoolFilter
                  ? 'Tente ajustar os filtros para ver mais resultados'
                  : 'Clique em "Calcular Riscos" para avaliar os alunos'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-4">
              {students.map((student) => (
                <StudentCard
                  key={student.id}
                  student={student}
                  onViewDetails={handleViewDetails}
                  onFollowUp={handleFollowUp}
                />
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {pagination.page} de {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Student Detail Dialog ── */}
      <StudentDetailDialog
        studentId={detailStudentId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onFollowUpFromDetail={handleFollowUpFromDetail}
      />

      {/* ── Follow-up Dialog (from student list) ── */}
      <FollowUpDialog
        student={followUpStudent}
        open={followUpOpen}
        onOpenChange={setFollowUpOpen}
        onSuccess={handleFollowUpSuccess}
      />

      {/* ── Follow-up Dialog (from student detail) ── */}
      <FollowUpDialog
        student={followUpFromDetailStudent}
        open={followUpFromDetailOpen}
        onOpenChange={setFollowUpFromDetailOpen}
        onSuccess={handleFollowUpSuccess}
      />
    </div>
  );
}
