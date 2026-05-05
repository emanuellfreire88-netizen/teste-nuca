import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    // Total students per school
    const schoolsWithCounts = await db.school.findMany({
      include: {
        _count: {
          select: { students: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const studentsPerSchool = schoolsWithCounts.map((s) => ({
      id: s.id,
      name: s.name,
      student_count: s._count.students,
    }));

    // Active vs inactive students
    const [activeStudents, inactiveStudents] = await Promise.all([
      db.student.count({ where: { status: 'active' } }),
      db.student.count({ where: { status: 'inactive' } }),
    ]);

    // Total counts
    const [totalStudents, totalSchools] = await Promise.all([
      db.student.count(),
      db.school.count(),
    ]);

    // Attendance summary
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

    const [todayPresent, todayAbsent, weekPresent, weekAbsent, monthPresent, monthAbsent] =
      await Promise.all([
        db.attendanceRecord.count({
          where: { date: { gte: todayStart, lte: todayEnd }, status: 'present' },
        }),
        db.attendanceRecord.count({
          where: { date: { gte: todayStart, lte: todayEnd }, status: 'absent' },
        }),
        db.attendanceRecord.count({
          where: { date: { gte: weekStart, lte: weekEnd }, status: 'present' },
        }),
        db.attendanceRecord.count({
          where: { date: { gte: weekStart, lte: weekEnd }, status: 'absent' },
        }),
        db.attendanceRecord.count({
          where: { date: { gte: monthStart, lte: monthEnd }, status: 'present' },
        }),
        db.attendanceRecord.count({
          where: { date: { gte: monthStart, lte: monthEnd }, status: 'absent' },
        }),
      ]);

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
        today: { present: todayPresent, absent: todayAbsent, total: todayPresent + todayAbsent },
        this_week: { present: weekPresent, absent: weekAbsent, total: weekPresent + weekAbsent },
        this_month: { present: monthPresent, absent: monthAbsent, total: monthPresent + monthAbsent },
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
