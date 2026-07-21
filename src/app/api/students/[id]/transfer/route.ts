import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

// ---------------------------------------------------------------------------
// POST /api/students/[id]/transfer — Transfer a student to another school
// Only Admins can perform transfers.
// ---------------------------------------------------------------------------
export async function POST(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin'], async (_req: AuthenticatedRequest) => {
    try {
      const { id: studentId } = await context.params;
      const body = await _req.json();
      const { to_school_id, reason } = body;

      // Validate required field
      if (!to_school_id) {
        return NextResponse.json(
          { error: 'Escola de destino é obrigatória' },
          { status: 400 }
        );
      }

      // 1. Verify student exists and get current school_id
      const student = await db.student.findUnique({
        where: { id: studentId },
        include: {
          school: { select: { id: true, name: true } },
        },
      });

      if (!student) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      const from_school_id = student.school_id;

      // 2. Verify target school exists
      const targetSchool = await db.school.findUnique({
        where: { id: to_school_id },
        select: { id: true, name: true },
      });

      if (!targetSchool) {
        return NextResponse.json(
          { error: 'Escola de destino não encontrada' },
          { status: 404 }
        );
      }

      // 3. Verify student is not already in the target school
      if (from_school_id === to_school_id) {
        return NextResponse.json(
          { error: 'O aluno já está matriculado na escola de destino' },
          { status: 400 }
        );
      }

      // 4. Update student.school_id to new school
      // NOTE: Neon HTTP adapter does not support $transaction, so we perform
      // operations sequentially. We update the student first, then create the
      // transfer record.
      await db.student.update({
        where: { id: studentId },
        data: { school_id: to_school_id },
      });

      // 5. Create StudentTransfer record
      const transferRecord = await db.studentTransfer.create({
        data: {
          student_id: studentId,
          from_school_id,
          to_school_id,
          reason: reason || null,
          transferred_by: _req.user!.userId,
        },
      });

      // 6. Log action
      const fromSchoolName = student.school.name;
      const toSchoolName = targetSchool.name;
      await logAction(
        _req.user!.userId,
        'transfer_student',
        `Aluno ${student.full_name} transferido de ${fromSchoolName} para ${toSchoolName}`,
        _req
      );

      // Fetch the updated student with school name
      const updatedStudent = await db.student.findUnique({
        where: { id: studentId },
        include: {
          school: { select: { id: true, name: true } },
        },
      });

      // Fetch the transfer record with related data
      const transferWithRelations = await db.studentTransfer.findUnique({
        where: { id: transferRecord.id },
        include: {
          from_school: { select: { id: true, name: true } },
          to_school: { select: { id: true, name: true } },
          transferred_by_user: { select: { id: true, full_name: true } },
        },
      });

      return NextResponse.json({
        student: updatedStudent,
        transfer: transferWithRelations,
      });
    } catch (error) {
      console.error('Transfer student error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}

// ---------------------------------------------------------------------------
// GET /api/students/[id]/transfer — Get transfer history for a student
// Any authenticated user can view transfer history.
// ---------------------------------------------------------------------------
export async function GET(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(async (_req: AuthenticatedRequest) => {
    try {
      const { id: studentId } = await context.params;

      // Verify student exists
      const student = await db.student.findUnique({
        where: { id: studentId },
        select: { id: true, full_name: true },
      });

      if (!student) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      // Get all transfer records for the student, sorted by transferred_at desc
      const transfers = await db.studentTransfer.findMany({
        where: { student_id: studentId },
        include: {
          from_school: { select: { id: true, name: true } },
          to_school: { select: { id: true, name: true } },
          transferred_by_user: { select: { id: true, full_name: true } },
        },
        orderBy: { transferred_at: 'desc' },
      });

      return NextResponse.json({ transfers });
    } catch (error) {
      console.error('Get student transfer history error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}
