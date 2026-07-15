import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds } from '@/lib/user-schools';

/**
 * GET /api/sync/pre-sync
 *
 * Returns all data needed for offline mode before a meeting.
 * Operators only see data for their assigned schools.
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;

    // Determine school scope
    const allowedSchoolIds = await getUserSchoolIds(userId, role);

    // If operator has no schools assigned, return empty data
    if (allowedSchoolIds !== null && allowedSchoolIds.length === 0) {
      return NextResponse.json({
        students: [],
        events: [],
        attendance: [],
        schools: [],
        synced_at: new Date().toISOString(),
      });
    }

    const schoolFilter = allowedSchoolIds === null
      ? {}
      : { school_id: { in: allowedSchoolIds } };

    // Fetch students (active only, with minimal fields for offline use)
    const students = await db.student.findMany({
      where: {
        status: 'active',
        ...schoolFilter,
      },
      select: {
        id: true,
        full_name: true,
        photo: true,
        school_id: true,
        class: true,
        grade: true,
      },
    });

    // Fetch upcoming + ongoing events (scoped to user's schools)
    const now = new Date();
    const eventSchoolFilter = allowedSchoolIds === null
      ? {}
      : { school_id: { in: allowedSchoolIds } };

    const events = await db.event.findMany({
      where: {
        status: { in: ['upcoming', 'ongoing'] },
        ...eventSchoolFilter,
      },
      select: {
        id: true,
        title: true,
        description: true,
        date: true,
        location: true,
        status: true,
        school_id: true,
        category: true,
        participants: {
          select: {
            student_id: true,
            attended: true,
            notes: true,
          },
        },
      },
      orderBy: { date: 'asc' },
    });

    // Fetch attendance records for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

    // Get student IDs from the user's schools for attendance filtering
    const studentIds = students.map((s) => s.id);

    const attendance = studentIds.length > 0
      ? await db.attendanceRecord.findMany({
          where: {
            date: { gte: thirtyDaysAgo },
            student_id: { in: studentIds },
          },
          select: {
            id: true,
            student_id: true,
            date: true,
            status: true,
            created_by: true,
          },
          orderBy: { date: 'desc' },
        })
      : [];

    // Fetch schools
    const schools = await db.school.findMany({
      where: allowedSchoolIds === null
        ? {}
        : { id: { in: allowedSchoolIds } },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        email: true,
        director_name: true,
        opening_hours: true,
        school_photo: true,
        latitude: true,
        longitude: true,
      },
    });

    // Update or create SyncRecord for this user/device
    const syncedAt = new Date();

    return NextResponse.json({
      students,
      events,
      attendance,
      schools,
      synced_at: syncedAt.toISOString(),
    });
  } catch (error) {
    console.error('Pre-sync error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
