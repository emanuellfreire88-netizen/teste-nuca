import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { canUserAccessSchool } from '@/lib/user-schools';
import { calculateStudentRisk, saveRiskAssessment } from '@/lib/dropout-risk';

// ---------------------------------------------------------------------------
// GET /api/dropout/[studentId] — Detailed risk info for a specific student
// ---------------------------------------------------------------------------
export async function GET(
  req: AuthenticatedRequest,
  context: { params: Promise<{ studentId: string }> }
) {
  return withAuth(async (_req: AuthenticatedRequest) => {
    try {
      const { studentId } = await context.params;

      const student = await db.student.findUnique({
        where: { id: studentId },
        include: {
          school: { select: { id: true, name: true } },
          dropout_risk_assessments: {
            orderBy: { calculated_at: 'desc' },
          },
          dropout_follow_ups: {
            orderBy: { created_at: 'desc' },
            include: {
              responsible: {
                select: { id: true, full_name: true },
              },
            },
          },
          attendance_records: {
            orderBy: { date: 'desc' },
            take: 60, // Last 60 records for history
          },
        },
      });

      if (!student) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      // Non-admins can only view students in schools they have access to
      const canAccess = await canUserAccessSchool(
        _req.user!.userId,
        _req.user!.role,
        student.school_id
      );
      if (!canAccess) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      // Format risk evolution (all assessments over time)
      const riskEvolution = student.dropout_risk_assessments.map((a) => ({
        id: a.id,
        risk_level: a.risk_level,
        score: a.score,
        reasons: JSON.parse(a.reasons),
        attendance_percentage: a.attendance_percentage,
        consecutive_absences: a.consecutive_absences,
        days_without_participation: a.days_without_participation,
        previous_risk_level: a.previous_risk_level,
        calculated_at: a.calculated_at,
      }));

      // Format follow-up history
      const followUpHistory = student.dropout_follow_ups.map((f) => ({
        id: f.id,
        action_type: f.action_type,
        description: f.description,
        notes: f.notes,
        responsible: f.responsible,
        created_at: f.created_at,
      }));

      // Format attendance history
      const attendanceHistory = student.attendance_records.map((r) => ({
        id: r.id,
        date: r.date,
        status: r.status,
      }));

      // Current (latest) risk assessment
      const currentAssessment =
        student.dropout_risk_assessments[0] || null;

      return NextResponse.json({
        student: {
          id: student.id,
          full_name: student.full_name,
          photo: student.photo,
          school: student.school,
          class: student.class,
          grade: student.grade,
          guardian_name: student.guardian_name,
          guardian_phone: student.guardian_phone,
          guardian_email: student.guardian_email,
          status: student.status,
        },
        current_risk: currentAssessment
          ? {
              risk_level: currentAssessment.risk_level,
              score: currentAssessment.score,
              reasons: JSON.parse(currentAssessment.reasons),
              attendance_percentage: currentAssessment.attendance_percentage,
              consecutive_absences: currentAssessment.consecutive_absences,
              days_without_participation:
                currentAssessment.days_without_participation,
              previous_risk_level: currentAssessment.previous_risk_level,
              calculated_at: currentAssessment.calculated_at,
            }
          : null,
        risk_evolution: riskEvolution,
        follow_up_history: followUpHistory,
        attendance_history: attendanceHistory,
      });
    } catch (error) {
      console.error('Get student dropout detail error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req);
}

// ---------------------------------------------------------------------------
// POST /api/dropout/[studentId] — Recalculate risk for a specific student
// ---------------------------------------------------------------------------
export async function POST(
  req: AuthenticatedRequest,
  context: { params: Promise<{ studentId: string }> }
) {
  return withRole(['Admin', 'Operator'], async (_req: AuthenticatedRequest) => {
    try {
      const { studentId } = await context.params;

      const student = await db.student.findUnique({
        where: { id: studentId },
        select: { id: true, full_name: true, school_id: true, status: true },
      });

      if (!student) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      // Non-admins can only operate on students in their schools
      const canAccess = await canUserAccessSchool(
        _req.user!.userId,
        _req.user!.role,
        student.school_id
      );
      if (!canAccess) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      if (student.status !== 'active') {
        return NextResponse.json(
          { error: 'Aluno não está ativo' },
          { status: 400 }
        );
      }

      // Calculate and save risk assessment
      const assessment = await calculateStudentRisk(studentId);
      await saveRiskAssessment(studentId, assessment);

      // Generate notification for high-risk
      if (assessment.risk_level === 'high') {
        const admins = await db.user.findMany({
          where: { role: 'Admin', status: 'active' },
          select: { id: true },
        });

        const operators = await db.user.findMany({
          where: {
            role: 'Operator',
            status: 'active',
            user_schools: {
              some: { school_id: student.school_id },
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
              message: `${student.full_name} foi identificado como alto risco de evasão.`,
              related_student_id: studentId,
            },
          });
        }
      }

      return NextResponse.json({
        message: 'Avaliação de risco recalculada com sucesso',
        assessment: {
          risk_level: assessment.risk_level,
          score: assessment.score,
          reasons: assessment.reasons,
          attendance_percentage: assessment.attendance_percentage,
          consecutive_absences: assessment.consecutive_absences,
          days_without_participation: assessment.days_without_participation,
          previous_risk_level: assessment.previous_risk_level,
        },
      });
    } catch (error) {
      console.error('Recalculate student dropout risk error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req);
}
