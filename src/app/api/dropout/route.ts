import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds } from '@/lib/user-schools';
import { calculateStudentRisk, saveRiskAssessment } from '@/lib/dropout-risk';

// ---------------------------------------------------------------------------
// GET /api/dropout — List students with their latest risk assessments
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const riskLevel = searchParams.get('risk_level') || '';
    const schoolId = searchParams.get('school_id') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const rawLimit = parseInt(searchParams.get('limit') || '10');
    const limit = Math.min(Math.max(1, rawLimit), 100);
    const skip = (page - 1) * limit;

    // ── School scoping ──
    const allowedSchoolIds = await getUserSchoolIds(
      req.user!.userId,
      req.user!.role
    );

    // Build the student where clause
    const studentWhere: Record<string, unknown> = { status: 'active' };

    if (allowedSchoolIds !== null) {
      // Non-admin: restrict to assigned schools
      if (schoolId) {
        if (!allowedSchoolIds.includes(schoolId)) {
          return NextResponse.json({
            students: [],
            pagination: { page, limit, total: 0, totalPages: 0 },
          });
        }
        studentWhere.school_id = schoolId;
      } else {
        studentWhere.school_id = { in: allowedSchoolIds };
      }
    } else if (schoolId) {
      // Admin filtering by school
      studentWhere.school_id = schoolId;
    }

    // If risk_level filter provided, we need to filter by the latest assessment
    // We'll fetch all matching students and their latest assessments, then filter in JS
    // This avoids complex subquery syntax that may not work with the HTTP adapter
    const [students, total] = await Promise.all([
      db.student.findMany({
        where: studentWhere,
        include: {
          school: { select: { id: true, name: true } },
          dropout_risk_assessments: {
            orderBy: { calculated_at: 'desc' },
            take: 1,
          },
        },
        orderBy: { full_name: 'asc' },
        skip,
        take: limit,
      }),
      db.student.count({ where: studentWhere }),
    ]);

    // Map to response format, applying risk_level filter if specified
    const result = students
      .map((student) => {
        const latestAssessment = student.dropout_risk_assessments[0] || null;
        return {
          id: student.id,
          full_name: student.full_name,
          photo: student.photo,
          school: student.school,
          attendance_percentage: latestAssessment?.attendance_percentage ?? null,
          days_without_participation:
            latestAssessment?.days_without_participation ?? null,
          consecutive_absences: latestAssessment?.consecutive_absences ?? null,
          risk_level: latestAssessment?.risk_level ?? 'low',
          score: latestAssessment?.score ?? 0,
          reasons: latestAssessment
            ? JSON.parse(latestAssessment.reasons)
            : [],
          calculated_at: latestAssessment?.calculated_at ?? null,
        };
      })
      .filter((s) => {
        if (!riskLevel) return true;
        return s.risk_level === riskLevel;
      });

    // Recalculate total after filter (approximation — acceptable for risk filter)
    const filteredTotal = riskLevel
      ? await countFilteredTotal(studentWhere, riskLevel)
      : total;

    return NextResponse.json({
      students: result,
      pagination: {
        page,
        limit,
        total: filteredTotal,
        totalPages: Math.ceil(filteredTotal / limit),
      },
    });
  } catch (error) {
    console.error('List dropout assessments error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

/**
 * Helper to count students matching a risk level filter.
 * Fetches all students with their latest assessment and counts matches.
 */
async function countFilteredTotal(
  studentWhere: Record<string, unknown>,
  riskLevel: string
): Promise<number> {
  const students = await db.student.findMany({
    where: studentWhere,
    select: {
      id: true,
      dropout_risk_assessments: {
        orderBy: { calculated_at: 'desc' },
        take: 1,
        select: { risk_level: true },
      },
    },
  });

  return students.filter(
    (s) => (s.dropout_risk_assessments[0]?.risk_level ?? 'low') === riskLevel
  ).length;
}

// ---------------------------------------------------------------------------
// POST /api/dropout — Calculate/re-calculate risk assessments for all students
// ---------------------------------------------------------------------------
export const POST = withRole(
  ['Admin', 'Operator'],
  async (req: AuthenticatedRequest) => {
    try {
      // ── School scoping ──
      const allowedSchoolIds = await getUserSchoolIds(
        req.user!.userId,
        req.user!.role
      );

      const studentWhere: Record<string, unknown> = { status: 'active' };
      if (allowedSchoolIds !== null) {
        studentWhere.school_id = { in: allowedSchoolIds };
      }

      // Fetch all active students within scope
      const students = await db.student.findMany({
        where: studentWhere,
        select: { id: true },
      });

      let assessmentsCreated = 0;
      let notificationsCreated = 0;

      // Process each student sequentially (Neon HTTP adapter limitation)
      for (const student of students) {
        try {
          const assessment = await calculateStudentRisk(student.id);

          await saveRiskAssessment(student.id, assessment);
          assessmentsCreated++;

          // Generate notification for high-risk students
          if (assessment.risk_level === 'high') {
            // Notify admins and operators associated with this student's school
            const studentFull = await db.student.findUnique({
              where: { id: student.id },
              select: {
                full_name: true,
                school_id: true,
              },
            });

            if (studentFull) {
              // Find users who should be notified (admins + operators for this school)
              const admins = await db.user.findMany({
                where: {
                  role: 'Admin',
                  status: 'active',
                },
                select: { id: true },
              });

              const operators = await db.user.findMany({
                where: {
                  role: 'Operator',
                  status: 'active',
                  user_schools: {
                    some: { school_id: studentFull.school_id },
                  },
                },
                select: { id: true },
              });

              const userIds = [
                ...new Set([
                  ...admins.map((u) => u.id),
                  ...operators.map((u) => u.id),
                ]),
              ];

              for (const userId of userIds) {
                await db.notification.create({
                  data: {
                    user_id: userId,
                    type: 'dropout_alert',
                    title: 'Alerta de Risco de Evasão',
                    message: `${studentFull.full_name} foi identificado como alto risco de evasão.`,
                    related_student_id: student.id,
                  },
                });
                notificationsCreated++;
              }
            }
          }
        } catch (err) {
          console.error(
            `Failed to assess student ${student.id}:`,
            err
          );
          // Continue processing other students
        }
      }

      return NextResponse.json({
        message: 'Avaliações de risco calculadas com sucesso',
        assessments_created: assessmentsCreated,
        notifications_created: notificationsCreated,
        total_students: students.length,
      });
    } catch (error) {
      console.error('Calculate dropout risk error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  }
);
