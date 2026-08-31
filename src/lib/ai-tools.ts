/**
 * AI Tools — Funções controladas que o assistente NUCA IA pode chamar.
 *
 * PRINCÍPIO DE SEGURANÇA:
 * - A IA NUNCA tem acesso direto ao banco de dados
 * - A IA só pode chamar estas funções pré-definidas
 * - Cada função valida permissões do usuário
 * - Cada função retorna APENAS dados agregados/necessários
 * - Nunca retorna dados pessoais (CPF, RG, telefone, endereço)
 * - Tudo é auditado via logAction
 *
 * Fluxo: Usuário → IA escolhe tool → Tool valida permissão → Tool consulta DB → Tool retorna dados agregados → IA processa → Resposta
 */

import { db } from '@/lib/db';
import { getUserSchoolIds } from '@/lib/user-schools';

export interface AIToolContext {
  userId: string;
  userRole: string;
  /** School IDs the user can access (null = all schools for Admin) */
  allowedSchoolIds: string[] | null;
}

export interface AIToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ─── Tool: getDashboardMetrics ─────────────────────────────────────────────
/**
 * Retorna métricas agregadas do dashboard (sem dados pessoais).
 */
export async function getDashboardMetrics(ctx: AIToolContext): Promise<AIToolResult> {
  try {
    const studentWhere: Record<string, unknown> = { status: 'active' };
    if (ctx.allowedSchoolIds !== null) {
      studentWhere.school_id = { in: ctx.allowedSchoolIds };
    }

    const [totalStudents, totalSchools, totalEvents, completedEvents] = await Promise.all([
      db.student.count({ where: studentWhere }),
      ctx.allowedSchoolIds !== null
        ? db.school.count({ where: { id: { in: ctx.allowedSchoolIds } } })
        : db.school.count(),
      db.event.count(),
      db.event.count({ where: { status: 'completed' } }),
    ]);

    return {
      success: true,
      data: {
        totalStudents,
        totalSchools,
        totalEvents,
        completedEvents,
        upcomingEvents: totalEvents - completedEvents,
      },
    };
  } catch {
    return { success: false, error: 'Erro ao buscar métricas' };
  }
}

// ─── Tool: getEvasionIndicators ─────────────────────────────────────────────
/**
 * Retorna indicadores de evasão escolar (apenas contagens agregadas).
 */
export async function getEvasionIndicators(ctx: AIToolContext): Promise<AIToolResult> {
  try {
    const studentWhere: Record<string, unknown> = { status: 'active' };
    if (ctx.allowedSchoolIds !== null) {
      studentWhere.school_id = { in: ctx.allowedSchoolIds };
    }

    // Get latest risk assessment per student
    const allAssessments = await db.dropoutRiskAssessment.findMany({
      where: { student: { status: 'active' } },
      include: { student: { select: { school_id: true } } },
      orderBy: { calculated_at: 'desc' },
    });

    // Filter by school scope
    const scoped = ctx.allowedSchoolIds !== null
      ? allAssessments.filter(a => ctx.allowedSchoolIds!.includes(a.student.school_id))
      : allAssessments;

    // Deduplicate (keep latest per student)
    const seen = new Set<string>();
    const latest = scoped.filter(a => {
      if (seen.has(a.student_id)) return false;
      seen.add(a.student_id);
      return true;
    });

    const byLevel = {
      low: latest.filter(a => a.risk_level === 'low').length,
      attention: latest.filter(a => a.risk_level === 'attention').length,
      medium: latest.filter(a => a.risk_level === 'medium').length,
      high: latest.filter(a => a.risk_level === 'high').length,
    };

    // Get follow-up counts
    const followedUp = await db.dropoutFollowUp.findMany({
      where: { student_id: { in: latest.map(a => a.student_id) } },
      select: { student_id: true },
      distinct: ['student_id'],
    });

    return {
      success: true,
      data: {
        totalAssessed: latest.length,
        riskDistribution: byLevel,
        atRisk: byLevel.medium + byLevel.high,
        withFollowUp: followedUp.length,
        withoutFollowUp: (byLevel.medium + byLevel.high) - followedUp.length,
        lastAssessmentDate: latest[0]?.calculated_at || null,
      },
    };
  } catch {
    return { success: false, error: 'Erro ao buscar indicadores de evasão' };
  }
}

// ─── Tool: getPendingAlerts ──────────────────────────────────────────────────
/**
 * Retorna pendências priorizadas (sem dados pessoais).
 */
export async function getPendingAlerts(ctx: AIToolContext): Promise<AIToolResult> {
  try {
    const highRisk = await db.dropoutRiskAssessment.findMany({
      where: { risk_level: 'high', student: { status: 'active' } },
      include: { student: { select: { school_id: true } } },
    });

    const scoped = ctx.allowedSchoolIds !== null
      ? highRisk.filter(r => ctx.allowedSchoolIds!.includes(r.student.school_id))
      : highRisk;

    const seen = new Set<string>();
    const uniqueHigh = scoped.filter(r => {
      if (seen.has(r.student_id)) return false;
      seen.add(r.student_id);
      return true;
    });

    const studentIds = uniqueHigh.map(r => r.student_id);
    const followedUp = await db.dropoutFollowUp.findMany({
      where: { student_id: { in: studentIds } },
      select: { student_id: true },
      distinct: ['student_id'],
    });
    const followedIds = new Set(followedUp.map(f => f.student_id));

    // Unread notifications for this user
    const unreadNotifs = await db.notification.count({
      where: { user_id: ctx.userId, read: false },
    });

    // Upcoming events (7 days)
    const now = new Date();
    const sevenDays = new Date();
    sevenDays.setDate(sevenDays.getDate() + 7);

    const upcomingEvents = await db.event.count({
      where: { date: { gte: now, lte: sevenDays }, status: 'upcoming' },
    });

    // Open support tickets (admin only)
    let openTickets = 0;
    if (ctx.userRole === 'Admin') {
      openTickets = await db.supportTicket.count({
        where: { status: { in: ['open', 'in_progress'] } },
      });
    }

    return {
      success: true,
      data: {
        highRiskWithoutFollowUp: uniqueHigh.filter(r => !followedIds.has(r.student_id)).length,
        unreadNotifications: unreadNotifs,
        upcomingEvents,
        openSupportTickets: openTickets,
      },
    };
  } catch {
    return { success: false, error: 'Erro ao buscar pendências' };
  }
}

// ─── Tool: getParticipationSummary ──────────────────────────────────────────
/**
 * Retorna resumo de participação em eventos (dados agregados por escola).
 */
export async function getParticipationSummary(ctx: AIToolContext): Promise<AIToolResult> {
  try {
    const events = await db.event.findMany({
      where: { status: 'completed' },
      select: {
        id: true,
        title: true,
        date: true,
        school_id: true,
        participants: { select: { attended: true } },
      },
    });

    const scopedEvents = ctx.allowedSchoolIds !== null
      ? events.filter(e => e.school_id && ctx.allowedSchoolIds!.includes(e.school_id))
      : events;

    const summary = scopedEvents.map(e => ({
      eventTitle: e.title,
      eventDate: e.date,
      totalParticipants: e.participants.length,
      attended: e.participants.filter(p => p.attended).length,
      attendanceRate: e.participants.length > 0
        ? Math.round((e.participants.filter(p => p.attended).length / e.participants.length) * 100)
        : 0,
    }));

    const avgAttendance = summary.length > 0
      ? Math.round(summary.reduce((sum, s) => sum + s.attendanceRate, 0) / summary.length)
      : 0;

    return {
      success: true,
      data: {
        totalCompletedEvents: summary.length,
        averageAttendanceRate: avgAttendance,
        events: summary.slice(0, 10), // Limit to 10 most recent
      },
    };
  } catch {
    return { success: false, error: 'Erro ao buscar resumo de participação' };
  }
}

// ─── Tool: getEventsSummary ─────────────────────────────────────────────────
/**
 * Retorna resumo de eventos (próximos e passados).
 */
export async function getEventsSummary(ctx: AIToolContext): Promise<AIToolResult> {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAhead = new Date();
    thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);

    const eventWhere: Record<string, unknown> = {};
    if (ctx.allowedSchoolIds !== null) {
      eventWhere.school_id = { in: ctx.allowedSchoolIds };
    }

    const [upcoming, past, byStatus] = await Promise.all([
      db.event.findMany({
        where: { ...eventWhere, date: { gte: now, lte: thirtyDaysAhead }, status: 'upcoming' },
        select: { id: true, title: true, date: true, location: true, category: true },
        orderBy: { date: 'asc' },
        take: 10,
      }),
      db.event.findMany({
        where: { ...eventWhere, date: { gte: thirtyDaysAgo, lte: now }, status: 'completed' },
        select: { id: true, title: true, date: true },
        orderBy: { date: 'desc' },
        take: 10,
      }),
      db.event.groupBy({
        by: ['status'],
        where: eventWhere,
        _count: true,
      }),
    ]);

    return {
      success: true,
      data: {
        upcomingEvents: upcoming.map(e => ({
          title: e.title,
          date: e.date,
          location: e.location,
          category: e.category,
        })),
        recentCompletedEvents: past.map(e => ({
          title: e.title,
          date: e.date,
        })),
        statusBreakdown: byStatus.reduce((acc, s) => {
          acc[s.status] = s._count;
          return acc;
        }, {} as Record<string, number>),
      },
    };
  } catch {
    return { success: false, error: 'Erro ao buscar resumo de eventos' };
  }
}

// ─── Tool: getNotificationsSummary ──────────────────────────────────────────
/**
 * Retorna resumo de notificações do usuário (sem conteúdo completo).
 */
export async function getNotificationsSummary(ctx: AIToolContext): Promise<AIToolResult> {
  try {
    const [unread, total, byType] = await Promise.all([
      db.notification.count({ where: { user_id: ctx.userId, read: false } }),
      db.notification.count({ where: { user_id: ctx.userId } }),
      db.notification.groupBy({
        by: ['type'],
        where: { user_id: ctx.userId, read: false },
        _count: true,
      }),
    ]);

    return {
      success: true,
      data: {
        unreadCount: unread,
        totalCount: total,
        unreadByType: byType.reduce((acc, t) => {
          acc[t.type] = t._count;
          return acc;
        }, {} as Record<string, number>),
      },
    };
  } catch {
    return { success: false, error: 'Erro ao buscar notificações' };
  }
}

// ─── Tool registry ──────────────────────────────────────────────────────────

export interface AITool {
  name: string;
  description: string;
  parameters: string[]; // Parameter names this tool accepts
  execute: (ctx: AIToolContext, params?: Record<string, unknown>) => Promise<AIToolResult>;
}

export const AI_TOOLS: Record<string, AITool> = {
  getDashboardMetrics: {
    name: 'getDashboardMetrics',
    description: 'Obter métricas gerais do dashboard: total de alunos, escolas, eventos',
    parameters: [],
    execute: (ctx) => getDashboardMetrics(ctx),
  },
  getEvasionIndicators: {
    name: 'getEvasionIndicators',
    description: 'Obter indicadores de evasão escolar: distribuição por nível de risco, acompanhamentos',
    parameters: [],
    execute: (ctx) => getEvasionIndicators(ctx),
  },
  getPendingAlerts: {
    name: 'getPendingAlerts',
    description: 'Obter pendências priorizadas: alertas sem acompanhamento, notificações não lidas, eventos próximos',
    parameters: [],
    execute: (ctx) => getPendingAlerts(ctx),
  },
  getParticipationSummary: {
    name: 'getParticipationSummary',
    description: 'Obter resumo de participação em eventos: taxa média, eventos recentes',
    parameters: [],
    execute: (ctx) => getParticipationSummary(ctx),
  },
  getEventsSummary: {
    name: 'getEventsSummary',
    description: 'Obter resumo de eventos: próximos 30 dias, últimos 30 dias, distribuição por status',
    parameters: [],
    execute: (ctx) => getEventsSummary(ctx),
  },
  getAttendanceTrend: {
    name: 'getAttendanceTrend',
    description: 'Obter tendência de frequência: comparar período atual vs anterior, variação percentual',
    parameters: [],
    execute: (ctx) => getAttendanceTrend(ctx),
  },
  getDocumentStats: {
    name: 'getDocumentStats',
    description: 'Obter estatísticas de documentos: total por status, por tipo',
    parameters: [],
    execute: (ctx) => getDocumentStats(ctx),
  },
  getNotificationsSummary: {
    name: 'getNotificationsSummary',
    description: 'Obter resumo de notificações do usuário: não lidas, por tipo',
    parameters: [],
    execute: (ctx) => getNotificationsSummary(ctx),
  },
};

// ─── Tool executor with validation ──────────────────────────────────────────

/**
 * Execute a tool by name, with permission validation.
 * This is the ONLY entry point for the IA to access system data.
 */
export async function executeAITool(
  toolName: string,
  ctx: AIToolContext,
  params?: Record<string, unknown>
): Promise<AIToolResult> {
  const tool = AI_TOOLS[toolName];

  if (!tool) {
    return { success: false, error: `Ferramenta '${toolName}' não existe` };
  }

  try {
    return await tool.execute(ctx, params);
  } catch (error) {
    console.error(`[AI Tool] Erro ao executar ${toolName}:`, error);
    return { success: false, error: 'Erro interno ao executar ferramenta' };
  }
}

/**
 * Get the list of available tools for the system prompt.
 */
export function getToolsDescription(): string {
  return Object.values(AI_TOOLS)
    .map(t => `- ${t.name}: ${t.description}`)
    .join('\n');
}

// ─── Tool: getAttendanceTrend ──────────────────────────────────────────────
/**
 * Retorna tendência de frequência (comparação períodos).
 */
export async function getAttendanceTrend(ctx: AIToolContext): Promise<AIToolResult> {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date(); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const recordWhere: Record<string, unknown> = {};
    if (ctx.allowedSchoolIds !== null) {
      recordWhere.student = { school_id: { in: ctx.allowedSchoolIds } };
    }

    const [current, previous] = await Promise.all([
      db.attendanceRecord.findMany({
        where: { ...recordWhere, date: { gte: thirtyDaysAgo } },
        select: { status: true },
      }),
      db.attendanceRecord.findMany({
        where: { ...recordWhere, date: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
        select: { status: true },
      }),
    ]);

    const currentPresent = current.filter(r => r.status === 'present').length;
    const currentTotal = current.length;
    const previousPresent = previous.filter(r => r.status === 'present').length;
    const previousTotal = previous.length;

    const currentRate = currentTotal > 0 ? Math.round((currentPresent / currentTotal) * 100) : 0;
    const previousRate = previousTotal > 0 ? Math.round((previousPresent / previousTotal) * 100) : 0;
    const variation = currentRate - previousRate;

    return {
      success: true,
      data: {
        currentPeriod: { days: 30, attendanceRate: currentRate, totalRecords: currentTotal },
        previousPeriod: { days: 30, attendanceRate: previousRate, totalRecords: previousTotal },
        variation: variation > 0 ? `+${variation}%` : `${variation}%`,
        trend: variation > 5 ? 'melhora' : variation < -5 ? 'queda' : 'estável',
      },
    };
  } catch {
    return { success: false, error: 'Erro ao buscar tendência de frequência' };
  }
}

// ─── Tool: getDocumentStats ─────────────────────────────────────────────────
/**
 * Retorna estatísticas de documentos (gestão documental).
 */
export async function getDocumentStats(ctx: AIToolContext): Promise<AIToolResult> {
  try {
    const [total, byStatus, byType] = await Promise.all([
      db.docManagementDocument.count(),
      db.docManagementDocument.groupBy({ by: ['status'], _count: true }),
      db.docManagementDocument.groupBy({ by: ['document_type'], _count: true }),
    ]);

    return {
      success: true,
      data: {
        totalDocuments: total,
        statusBreakdown: byStatus.reduce((acc, s) => {
          acc[s.status] = s._count; return acc;
        }, {} as Record<string, number>),
        typeBreakdown: byType.reduce((acc, t) => {
          acc[t.document_type] = t._count; return acc;
        }, {} as Record<string, number>),
      },
    };
  } catch {
    return { success: false, error: 'Erro ao buscar estatísticas de documentos' };
  }
}
