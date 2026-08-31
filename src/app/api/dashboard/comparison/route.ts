import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds } from '@/lib/user-schools';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/dashboard/comparison
 *
 * Returns temporal comparison: current month vs previous month.
 * Includes: attendance rate, events, documents, tasks, alerts.
 * All data is aggregated — no personal data.
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const allowedSchoolIds = await getUserSchoolIds(userId, userRole);

    // Date ranges
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const studentWhere: Record<string, unknown> = {};
    if (allowedSchoolIds !== null) {
      studentWhere.school_id = { in: allowedSchoolIds };
    }

    // 1. Attendance comparison
    const attendanceWhere = allowedSchoolIds !== null
      ? { student: { school_id: { in: allowedSchoolIds } } }
      : {};

    const [thisMonthAttendance, lastMonthAttendance] = await Promise.all([
      db.attendanceRecord.findMany({
        where: { ...attendanceWhere, date: { gte: thisMonthStart, lt: thisMonthEnd } },
        select: { status: true },
      }),
      db.attendanceRecord.findMany({
        where: { ...attendanceWhere, date: { gte: lastMonthStart, lt: thisMonthStart } },
        select: { status: true },
      }),
    ]);

    const thisPresent = thisMonthAttendance.filter(r => r.status === 'present').length;
    const thisTotal = thisMonthAttendance.length;
    const lastPresent = lastMonthAttendance.filter(r => r.status === 'present').length;
    const lastTotal = lastMonthAttendance.length;

    const thisRate = thisTotal > 0 ? Math.round((thisPresent / thisTotal) * 100) : null;
    const lastRate = lastTotal > 0 ? Math.round((lastPresent / lastTotal) * 100) : null;

    // 2. Events comparison
    const [thisMonthEvents, lastMonthEvents] = await Promise.all([
      db.event.count({ where: { date: { gte: thisMonthStart, lt: thisMonthEnd } } }),
      db.event.count({ where: { date: { gte: lastMonthStart, lt: thisMonthStart } } }),
    ]);

    // 3. Documents comparison
    const [thisMonthDocs, lastMonthDocs] = await Promise.all([
      db.docManagementDocument.count({ where: { created_at: { gte: thisMonthStart, lt: thisMonthEnd } } }),
      db.docManagementDocument.count({ where: { created_at: { gte: lastMonthStart, lt: thisMonthStart } } }),
    ]);

    // 4. Tasks comparison
    const taskWhere = userRole !== 'Admin'
      ? { OR: [{ assigned_to: userId }, { created_by: userId }] }
      : {};

    const [thisMonthTasks, lastMonthTasks] = await Promise.all([
      db.task.count({ where: { ...taskWhere, created_at: { gte: thisMonthStart, lt: thisMonthEnd } } }),
      db.task.count({ where: { ...taskWhere, created_at: { gte: lastMonthStart, lt: thisMonthStart } } }),
    ]);

    // 5. Dropout alerts comparison
    const dropoutWhere = allowedSchoolIds !== null
      ? { student: { school_id: { in: allowedSchoolIds } } }
      : {};

    const [thisMonthAlerts, lastMonthAlerts] = await Promise.all([
      db.dropoutRiskAssessment.count({
        where: { ...dropoutWhere, risk_level: { in: ['medium', 'high'] }, calculated_at: { gte: thisMonthStart, lt: thisMonthEnd } },
      }),
      db.dropoutRiskAssessment.count({
        where: { ...dropoutWhere, risk_level: { in: ['medium', 'high'] }, calculated_at: { gte: lastMonthStart, lt: thisMonthStart } },
      }),
    ]);

    // Helper: calculate variation
    const calcVariation = (current: number | null, previous: number | null) => {
      if (current === null || previous === null) return null;
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    return NextResponse.json({
      period: {
        current: { start: thisMonthStart, end: thisMonthEnd },
        previous: { start: lastMonthStart, end: thisMonthStart },
      },
      metrics: {
        attendance: {
          current: thisRate,
          previous: lastRate,
          variation: thisRate !== null && lastRate !== null ? thisRate - lastRate : null,
          unit: 'percentage_points',
          insufficientData: thisTotal === 0 && lastTotal === 0,
        },
        events: {
          current: thisMonthEvents,
          previous: lastMonthEvents,
          variation: calcVariation(thisMonthEvents, lastMonthEvents),
          unit: 'count',
        },
        documents: {
          current: thisMonthDocs,
          previous: lastMonthDocs,
          variation: calcVariation(thisMonthDocs, lastMonthDocs),
          unit: 'count',
        },
        tasks: {
          current: thisMonthTasks,
          previous: lastMonthTasks,
          variation: calcVariation(thisMonthTasks, lastMonthTasks),
          unit: 'count',
        },
        dropoutAlerts: {
          current: thisMonthAlerts,
          previous: lastMonthAlerts,
          variation: calcVariation(thisMonthAlerts, lastMonthAlerts),
          unit: 'count',
        },
      },
    });
  } catch (error) {
    console.error('Dashboard comparison error:', error);
    return NextResponse.json({ error: 'Erro ao carregar comparação' }, { status: 500 });
  }
});
