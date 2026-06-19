import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds } from '@/lib/user-schools';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    // Date ranges
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // This week (Monday to Sunday)
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // This month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // ── Scope all stats to the operator's assigned schools ──
    // Admins see global stats (allowedSchoolIds === null).
    const allowedSchoolIds = await getUserSchoolIds(req.user!.userId, req.user!.role);
    const schoolFilter = allowedSchoolIds !== null
      ? { id: { in: allowedSchoolIds } }
      : {};
    const studentSchoolFilter = allowedSchoolIds !== null
      ? { school_id: { in: allowedSchoolIds } }
      : {};

    // Run all independent queries in parallel
    const [schoolsWithCounts, studentStatusCounts, todayAttendance, weekAttendance, monthAttendance] =
      await Promise.all([
        // School list with student counts (scoped to allowed schools)
        db.school.findMany({
          where: schoolFilter,
          include: {
            _count: {
              select: { students: true },
            },
          },
          orderBy: { name: 'asc' },
        }),

        // Student status counts (scoped to allowed schools)
        db.student.groupBy({
          by: ['status'],
          _count: { status: true },
          where: studentSchoolFilter,
        }),

        // Attendance per period (scoped via student.school_id)
        db.attendanceRecord.groupBy({
          by: ['status'],
          _count: { status: true },
          where: {
            date: { gte: todayStart, lte: todayEnd },
            student: studentSchoolFilter,
          },
        }),

        db.attendanceRecord.groupBy({
          by: ['status'],
          _count: { status: true },
          where: {
            date: { gte: weekStart, lte: weekEnd },
            student: studentSchoolFilter,
          },
        }),

        db.attendanceRecord.groupBy({
          by: ['status'],
          _count: { status: true },
          where: {
            date: { gte: monthStart, lte: monthEnd },
            student: studentSchoolFilter,
          },
        }),
      ]);

    // Derive students per school from the single school query
    const studentsPerSchool = schoolsWithCounts.map((s) => ({
      id: s.id,
      name: s.name,
      student_count: s._count.students,
    }));

    // Derive student counts from groupBy result
    let activeStudents = 0;
    let inactiveStudents = 0;
    for (const group of studentStatusCounts) {
      if (group.status === 'active') activeStudents = group._count.status;
      else if (group.status === 'inactive') inactiveStudents = group._count.status;
    }
    const totalStudents = activeStudents + inactiveStudents;

    // Derive totalSchools from school list (no separate query needed)
    const totalSchools = schoolsWithCounts.length;

    // Helper to extract present/absent counts from groupBy result
    const extractCounts = (groups: { status: string; _count: { status: number } }[]) => {
      let present = 0;
      let absent = 0;
      for (const group of groups) {
        if (group.status === 'present') present = group._count.status;
        else if (group.status === 'absent') absent = group._count.status;
      }
      return { present, absent, total: present + absent };
    };

    return NextResponse.json({
      students: {
        total: totalStudents,
        active: activeStudents,
        inactive: inactiveStudents,
        per_school: studentsPerSchool,
      },
      schools: {
        total: totalSchools,
      },
      attendance: {
        today: extractCounts(todayAttendance),
        this_week: extractCounts(weekAttendance),
        this_month: extractCounts(monthAttendance),
      },
    });
  } catch (error) {
    console.error('Reports error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
