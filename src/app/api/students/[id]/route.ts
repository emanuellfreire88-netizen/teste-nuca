import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

export async function GET(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;
      const student = await db.student.findUnique({
        where: { id },
        include: {
          school: {
            select: { id: true, name: true },
          },
        },
      });

      if (!student) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      return NextResponse.json({ student });
    } catch (error) {
      console.error('Get student error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}

export async function PUT(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin', 'Operator'], async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;
      const body = await _req.json();

      const existingStudent = await db.student.findUnique({ where: { id } });
      if (!existingStudent) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      // Check CPF uniqueness if changing
      if (body.cpf && body.cpf !== existingStudent.cpf) {
        const cpfTaken = await db.student.findUnique({ where: { cpf: body.cpf } });
        if (cpfTaken) {
          return NextResponse.json(
            { error: 'CPF já cadastrado' },
            { status: 409 }
          );
        }
      }

      // Verify school exists if changing
      if (body.school_id && body.school_id !== existingStudent.school_id) {
        const school = await db.school.findUnique({ where: { id: body.school_id } });
        if (!school) {
          return NextResponse.json(
            { error: 'Escola não encontrada' },
            { status: 404 }
          );
        }
      }

      const updateData: Record<string, unknown> = {};
      const stringFields = ['full_name', 'cpf', 'rg', 'blood_type', 'special_needs', 'medications', 'class', 'grade', 'phone', 'address', 'guardian_name', 'guardian_phone', 'guardian_email', 'emergency_contact', 'school_id', 'status', 'photo'];
      for (const field of stringFields) {
        if (body[field] !== undefined) updateData[field] = body[field] || null;
      }

      if (body.date_of_birth !== undefined) {
        updateData.date_of_birth = body.date_of_birth ? new Date(body.date_of_birth) : null;
      }

      const student = await db.student.update({
        where: { id },
        data: updateData,
        include: {
          school: {
            select: { id: true, name: true },
          },
        },
      });

      await logAction(_req.user!.userId, 'update_student', `Aluno atualizado: ${student.full_name}`, _req);

      return NextResponse.json({ student });
    } catch (error) {
      console.error('Update student error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}

export async function DELETE(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin'], async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;

      const existingStudent = await db.student.findUnique({ where: { id } });
      if (!existingStudent) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      // Use transaction for cascade delete to ensure data consistency
      await db.$transaction(async (tx) => {
        // Delete attendance records first (cascade manually since Prisma doesn't auto-cascade)
        await tx.attendanceRecord.deleteMany({ where: { student_id: id } });
        await tx.student.delete({ where: { id } });
      });

      await logAction(_req.user!.userId, 'delete_student', `Aluno excluído: ${existingStudent.full_name}`, _req);

      return NextResponse.json({ message: 'Aluno excluído com sucesso' });
    } catch (error) {
      console.error('Delete student error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}
