import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds } from '@/lib/user-schools';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || 'month';
    const school_id = searchParams.get('school_id') || '';
    const category = searchParams.get('category') || '';

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'year') {
      startDate = new Date(now);
      startDate.setFullYear(startDate.getFullYear() - 1);
    } else {
      // month (default)
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
    }

    // Base event filters
    const eventWhere: Record<string, unknown> = {};
    if (school_id) eventWhere.school_id = school_id;
    if (category) eventWhere.category = category;

    // ── School scoping (VULN-3 FIX) ──
    // Non-admins are restricted to their assigned schools. If they pass a
    // school_id, we verify it's in their allowed set; otherwise we filter
    // events to their allowed schools.
    const allowedSchoolIds = await getUserSchoolIds(req.user!.userId, req.user!.role);

    if (allowedSchoolIds !== null) {
      if (school_id) {
        if (!allowedSchoolIds.includes(school_id)) {
          // Out-of-scope filter — return an empty dashboard rather than
          // revealing that the school exists.
          return NextResponse.json({
            overall_ranking: [],
            school_ranking: [],
            category_ranking: [],
            period_stats: {
              total_events: 0,
              total_participations: 0,
              evolution: [],
            },
            most_popular_events: [],
            never_participated: 0,
            badge_alerts: [],
            total_absences: 0,
            total_absent_students: 0,
            absent_ranking: [],
          });
        }
        // school_id already applied to eventWhere above
      } else {
        eventWhere.school_id = { in: allowedSchoolIds };
      }
    }

    // Student count filter mirrors the event scoping so that the
    // `never_participated` and absence stats only consider students the
    // caller can see.
    const studentCountWhere: Record<string, unknown> =
      allowedSchoolIds !== null
        ? { status: 'active', school_id: { in: allowedSchoolIds } }
        : { status: 'active' };

    const periodEventWhere: Record<string, unknown> = {
      ...eventWhere,
      date: { gte: startDate },
    };

    // ── Overall Ranking (only students who ATTENDED) ──
    const participations = await db.eventParticipant.findMany({
      where: {
        attended: true, // ← only count attendees
        event: {
          ...eventWhere,
        },
      },
      select: {
        student_id: true,
        student: {
          select: {
            id: true,
            full_name: true,
            photo: true,
            school: { select: { name: true } },
          },
        },
      },
    });

    const studentCountMap = new Map<string, { student: typeof participations[0]['student']; count: number }>();
    for (const p of participations) {
      const existing = studentCountMap.get(p.student_id);
      if (existing) {
        existing.count++;
      } else {
        studentCountMap.set(p.student_id, { student: p.student, count: 1 });
      }
    }

    const overallRanking = Array.from(studentCountMap.entries())
      .map(([, val]) => ({
        student_id: val.student.id,
        full_name: val.student.full_name,
        photo: val.student.photo,
        school_name: val.student.school?.name || null,
        total_events: val.count,
      }))
      .sort((a, b) => b.total_events - a.total_events)
      .slice(0, 20);

    // ── School Ranking (only ATTENDED participations) ──
    const schoolParticipationMap = new Map<string, { school_name: string; total_participations: number }>();
    for (const p of participations) {
      const schoolName = p.student.school?.name || 'Sem escola';
      const schoolKey = p.student.school?.name || 'no-school';
      const existing = schoolParticipationMap.get(schoolKey);
      if (existing) {
        existing.total_participations++;
      } else {
        schoolParticipationMap.set(schoolKey, { school_name: schoolName, total_participations: 1 });
      }
    }

    const schoolRanking = Array.from(schoolParticipationMap.values())
      .sort((a, b) => b.total_participations - a.total_participations);

    // ── Category Ranking (only ATTENDED participations) ──
    const events = await db.event.findMany({
      where: eventWhere,
      select: {
        category: true,
        participants: {
          where: { attended: true }, // ← only attendees
          select: { id: true },
        },
      },
    });

    const categoryMap = new Map<string, { total_events: number; total_participations: number }>();
    for (const e of events) {
      const cat = e.category || 'other';
      const attendedCount = e.participants.length;
      const existing = categoryMap.get(cat);
      if (existing) {
        existing.total_events++;
        existing.total_participations += attendedCount;
      } else {
        categoryMap.set(cat, { total_events: 1, total_participations: attendedCount });
      }
    }

    const categoryRanking = Array.from(categoryMap.entries()).map(([cat, val]) => ({
      category: cat,
      total_events: val.total_events,
      total_participations: val.total_participations,
    }));

    // ── Period Stats (only ATTENDED participations) ──
    const periodEvents = await db.event.findMany({
      where: periodEventWhere,
      select: {
        id: true,
        date: true,
        participants: {
          where: { attended: true }, // ← only attendees
          select: { id: true },
        },
      },
      orderBy: { date: 'asc' },
    });

    const totalEvents = periodEvents.length;
    const totalParticipations = periodEvents.reduce(
      (sum, e) => sum + e.participants.length,
      0
    );

    // Evolution by month
    const monthMap = new Map<string, { events: number; participations: number }>();
    for (const e of periodEvents) {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const attendedCount = e.participants.length;
      const existing = monthMap.get(key);
      if (existing) {
        existing.events++;
        existing.participations += attendedCount;
      } else {
        monthMap.set(key, { events: 1, participations: attendedCount });
      }
    }

    const evolution = Array.from(monthMap.entries())
      .map(([periodKey, val]) => ({ period: periodKey, ...val }))
      .sort((a, b) => a.period.localeCompare(b.period));

    // ── Most Popular Events (by ATTENDED count) ──
    const popularEvents = await db.event.findMany({
      where: eventWhere,
      select: {
        id: true,
        title: true,
        category: true,
        participants: {
          where: { attended: true }, // ← only attendees
          select: { id: true },
        },
      },
    });

    const mostPopularEvents = popularEvents
      .map((e) => ({
        id: e.id,
        title: e.title,
        category: e.category,
        participant_count: e.participants.length,
      }))
      .sort((a, b) => b.participant_count - a.participant_count)
      .slice(0, 5);

    // ── Never Participated (students who never ATTENDED) ──
    const totalStudents = await db.student.count({ where: studentCountWhere });
    const studentsWithParticipations = new Set(participations.map((p) => p.student_id));
    const neverParticipated = totalStudents - studentsWithParticipations.size;

    // ── NEW: Absent Students (registered but did NOT attend) ──
    const absences = await db.eventParticipant.findMany({
      where: {
        attended: false,
        event: {
          ...eventWhere,
        },
      },
      select: {
        student_id: true,
        student: {
          select: {
            id: true,
            full_name: true,
            photo: true,
            school: { select: { name: true } },
          },
        },
      },
    });

    const absenceMap = new Map<
      string,
      { student: typeof absences[0]['student']; count: number }
    >();
    for (const a of absences) {
      const existing = absenceMap.get(a.student_id);
      if (existing) {
        existing.count++;
      } else {
        absenceMap.set(a.student_id, { student: a.student, count: 1 });
      }
    }

    const absentRanking = Array.from(absenceMap.entries())
      .map(([, val]) => ({
        student_id: val.student.id,
        full_name: val.student.full_name,
        photo: val.student.photo,
        school_name: val.student.school?.name || null,
        total_absences: val.count,
      }))
      .sort((a, b) => b.total_absences - a.total_absences)
      .slice(0, 10);

    const totalAbsences = absences.length;
    const totalAbsentStudents = absenceMap.size;

    // ── Badge Alerts ──
    // Check students who just reached 5 or 10 events but don't have the badge yet
    const badgeThresholds = [
      { badge_type: '5_events', threshold: 5 },
      { badge_type: '10_events', threshold: 10 },
      { badge_type: '20_events', threshold: 20 },
    ];

    const badgeAlerts: Array<{
      student_id: string;
      full_name: string;
      total_events: number;
      badge_type: string;
      new: boolean;
    }> = [];

    for (const [studentId, val] of studentCountMap.entries()) {
      for (const bt of badgeThresholds) {
        if (val.count >= bt.threshold) {
          // Check if badge exists
          const existingBadge = await db.participationBadge.findUnique({
            where: {
              student_id_badge_type: {
                student_id: studentId,
                badge_type: bt.badge_type,
              },
            },
          });

          if (!existingBadge) {
            badgeAlerts.push({
              student_id: studentId,
              full_name: val.student.full_name,
              total_events: val.count,
              badge_type: bt.badge_type,
              new: true,
            });
          }
        }
      }
    }

    // Sort badge alerts by total_events desc
    badgeAlerts.sort((a, b) => b.total_events - a.total_events);

    return NextResponse.json({
      overall_ranking: overallRanking,
      school_ranking: schoolRanking,
      category_ranking: categoryRanking,
      period_stats: {
        total_events: totalEvents,
        total_participations: totalParticipations,
        evolution,
      },
      most_popular_events: mostPopularEvents,
      never_participated: Math.max(0, neverParticipated),
      badge_alerts: badgeAlerts,
      // NEW: absence data
      total_absences: totalAbsences,
      total_absent_students: totalAbsentStudents,
      absent_ranking: absentRanking,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
