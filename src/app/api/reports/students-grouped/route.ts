import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds } from '@/lib/user-schools';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || '';
    const school_id = searchParams.get('school_id') || '';
    const grade = searchParams.get('grade') || '';
    const classFilter = searchParams.get('class') || '';
    const sortOrder = searchParams.get('sort') || 'asc';

    // Build where clause
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (grade) where.grade = grade;
    if (classFilter) where.class = classFilter;

    // ── School scoping (VULN-2 FIX) ──
    // Non-admins are restricted to their assigned schools. If they request a
    // specific school_id, we also verify it is within their allowed set.
    const allowedSchoolIds = await getUserSchoolIds(req.user!.userId, req.user!.role);

    if (allowedSchoolIds !== null) {
      // Non-admin
      if (school_id) {
        if (!allowedSchoolIds.includes(school_id)) {
          // Requested school is outside the caller's scope — return an empty
          // result set rather than a 404 so the endpoint behaves the same as
          // a legitimate empty filter (no information leakage).
          return NextResponse.json({
            groups: [],
            grand_total: 0,
            filters: {
              schools: [],
              grades: [],
              classes: [],
            },
          });
        }
        where.school_id = school_id;
      } else {
        where.school_id = { in: allowedSchoolIds };
      }
    } else if (school_id) {
      // Admin explicitly filtering by school
      where.school_id = school_id;
    }

    // Fetch all matching students with school info
    const students = await db.student.findMany({
      where,
      include: {
        school: {
          select: { id: true, name: true, address: true, phone: true, director_name: true },
        },
      },
      orderBy: [
        { school: { name: 'asc' } },
        { full_name: sortOrder === 'desc' ? 'desc' : 'asc' },
      ],
      take: 10000,
    });

    // Group students by school
    const schoolMap = new Map<string, {
      school_id: string;
      school_name: string;
      school_address: string | null;
      school_phone: string | null;
      school_director: string | null;
      students: typeof students;
    }>();

    for (const student of students) {
      const sid = student.school.id;
      if (!schoolMap.has(sid)) {
        schoolMap.set(sid, {
          school_id: sid,
          school_name: student.school.name,
          school_address: student.school.address,
          school_phone: student.school.phone,
          school_director: student.school.director_name,
          students: [],
        });
      }
      schoolMap.get(sid)!.students.push(student);
    }

    // Convert map to array sorted by school name
    const groups = Array.from(schoolMap.values()).sort((a, b) =>
      a.school_name.localeCompare(b.school_name, 'pt-BR')
    );

    const grandTotal = students.length;

    // Available filter options
    // VULN-2 FIX: scope the filter option queries to the user's allowed
    // schools so non-admins can't enumerate schools (and grades/classes
    // inside those schools) outside their scope.
    const schoolFilterWhere =
      allowedSchoolIds !== null
        ? { id: { in: allowedSchoolIds } }
        : {};

    const studentFilterWhere: Record<string, unknown> =
      allowedSchoolIds !== null
        ? { school_id: { in: allowedSchoolIds } }
        : {};

    const allSchools = await db.school.findMany({
      where: schoolFilterWhere,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const allGrades = await db.student.findMany({
      where: { ...studentFilterWhere, grade: { not: null } },
      select: { grade: true },
      distinct: ['grade'],
      orderBy: { grade: 'asc' },
    });

    const allClasses = await db.student.findMany({
      where: { ...studentFilterWhere, class: { not: null } },
      select: { class: true },
      distinct: ['class'],
      orderBy: { class: 'asc' },
    });

    return NextResponse.json({
      groups,
      grand_total: grandTotal,
      filters: {
        schools: allSchools,
        grades: allGrades.map(g => g.grade).filter(Boolean),
        classes: allClasses.map(c => c.class).filter(Boolean),
      },
    });
  } catch (error) {
    console.error('Grouped students report error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
