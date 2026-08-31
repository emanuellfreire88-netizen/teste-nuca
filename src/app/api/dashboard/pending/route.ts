import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds } from '@/lib/user-schools';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/dashboard/pending
 *
 * Returns a prioritized list of items that need the user's attention.
 * Organized by priority: CRITICAL, HIGH, ATTENTION, INFO.
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    const allowedSchoolIds = await getUserSchoolIds(userId, userRole);
    const studentWhere: Record<string, unknown> = { status: 'active' };
    if (allowedSchoolIds !== null) {
      studentWhere.school_id = { in: allowedSchoolIds };
    }

    const pending: Array<{
      title: string;
      description: string;
      priority: 'CRITICAL' | 'HIGH' | 'ATTENTION' | 'INFO';
      action_label: string;
      action_url: string;
      count: number;
    }> = [];

    // 1. High-risk students without follow-up
    const highRisk = await db.dropoutRiskAssessment.findMany({
      where: { risk_level: 'high', student: { status: 'active' } },
      include: { student: { select: { id: true, school_id: true } } },
      orderBy: { calculated_at: 'desc' },
    });

    const scopedHigh = allowedSchoolIds !== null
      ? highRisk.filter(r => allowedSchoolIds.includes(r.student.school_id))
      : highRisk;

    const seenHigh = new Set<string>();
    const uniqueHigh = scopedHigh.filter(r => {
      if (seenHigh.has(r.student_id)) return false;
      seenHigh.add(r.student_id);
      return true;
    });

    if (uniqueHigh.length > 0) {
      const studentIds = uniqueHigh.map(r => r.student_id);
      const followedUp = await db.dropoutFollowUp.findMany({
        where: { student_id: { in: studentIds } },
        select: { student_id: true },
        distinct: ['student_id'],
      });
      const followedIds = new Set(followedUp.map(f => f.student_id));
      const withoutFollowUp = uniqueHigh.filter(r => !followedIds.has(r.student_id));

      if (withoutFollowUp.length > 0) {
        pending.push({
          title: 'Adolescentes com risco alto sem acompanhamento',
          description: `${withoutFollowUp.length} adolescente(s) em alto risco de evasão sem intervenção.`,
          priority: 'CRITICAL',
          action_label: 'Ver casos',
          action_url: 'dropout',
          count: withoutFollowUp.length,
        });
      }
    }

    // 2. Medium risk students
    const mediumRisk = await db.dropoutRiskAssessment.findMany({
      where: { risk_level: 'medium', student: { status: 'active' } },
      include: { student: { select: { school_id: true } } },
      orderBy: { calculated_at: 'desc' },
    });

    const scopedMedium = allowedSchoolIds !== null
      ? mediumRisk.filter(r => allowedSchoolIds.includes(r.student.school_id))
      : mediumRisk;

    const seenMedium = new Set<string>();
    const uniqueMedium = scopedMedium.filter(r => {
      if (seenMedium.has(r.student_id)) return false;
      seenMedium.add(r.student_id);
      return true;
    });

    if (uniqueMedium.length > 0) {
      pending.push({
        title: 'Adolescentes com risco moderado',
        description: `${uniqueMedium.length} adolescente(s) com indicadores de atenção.`,
        priority: 'HIGH',
        action_label: 'Ver casos',
        action_url: 'dropout',
        count: uniqueMedium.length,
      });
    }

    // 3. Unread notifications
    const unreadNotifs = await db.notification.count({
      where: { user_id: userId, read: false },
    });

    if (unreadNotifs > 0) {
      pending.push({
        title: 'Notificações não lidas',
        description: `Você tem ${unreadNotifs} notificação(ões) não lida(s).`,
        priority: 'ATTENTION',
        action_label: 'Ver notificações',
        action_url: 'dashboard',
        count: unreadNotifs,
      });
    }

    // 4. Upcoming events (7 days)
    const now = new Date();
    const sevenDays = new Date();
    sevenDays.setDate(sevenDays.getDate() + 7);

    const upcomingEvents = await db.event.findMany({
      where: { date: { gte: now, lte: sevenDays }, status: 'upcoming' },
      select: { id: true },
    });

    if (upcomingEvents.length > 0) {
      pending.push({
        title: 'Eventos próximos',
        description: `${upcomingEvents.length} evento(s) nos próximos 7 dias.`,
        priority: 'ATTENTION',
        action_label: 'Ver eventos',
        action_url: 'events',
        count: upcomingEvents.length,
      });
    }

    // 5. Open support tickets (admin only)
    if (userRole === 'Admin') {
      const openTickets = await db.supportTicket.count({
        where: { status: { in: ['open', 'in_progress'] } },
      });

      if (openTickets > 0) {
        pending.push({
          title: 'Tickets de suporte abertos',
          description: `${openTickets} ticket(s) aguardando atendimento.`,
          priority: 'HIGH',
          action_label: 'Ver tickets',
          action_url: 'support',
          count: openTickets,
        });
      }
    }

    // 6. Overdue tasks
    const overdueTasks = await db.task.count({
      where: {
        due_date: { lt: now },
        status: { in: ['pending', 'in_progress', 'blocked'] },
        ...(userRole !== 'Admin' ? {
          OR: [{ assigned_to: userId }, { created_by: userId }],
        } : {}),
      },
    });

    if (overdueTasks > 0) {
      pending.push({
        title: 'Tarefas atrasadas',
        description: `${overdueTasks} tarefa(s) com prazo vencido.`,
        priority: 'HIGH',
        action_label: 'Ver tarefas',
        action_url: 'tasks',
        count: overdueTasks,
      });
    }

    // Sort by priority
    const order = { CRITICAL: 0, HIGH: 1, ATTENTION: 2, INFO: 3 };
    pending.sort((a, b) => order[a.priority] - order[b.priority]);

    return NextResponse.json({
      pending,
      summary: {
        total: pending.length,
        critical: pending.filter(p => p.priority === 'CRITICAL').length,
        high: pending.filter(p => p.priority === 'HIGH').length,
        attention: pending.filter(p => p.priority === 'ATTENTION').length,
        info: pending.filter(p => p.priority === 'INFO').length,
      },
    });
  } catch (error) {
    console.error('Dashboard pending error:', error);
    return NextResponse.json({ error: 'Erro ao carregar pendências' }, { status: 500 });
  }
});
