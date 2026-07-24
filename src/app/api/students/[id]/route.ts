import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { sanitizeInput } from '@/lib/auth';
import { logAction } from '@/lib/logger';
import { canUserAccessSchool } from '@/lib/user-schools';

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
  return withRole(['Admin'], async (_req: AuthenticatedRequest) => {
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

      const updateData: Record<string, unknown> = {};
      // VULN-8 FIX: sanitize all free-text fields to prevent stored XSS.
      // `photo` is a base64 data URL and must NOT be sanitized (would break it).
      const textFields = ['full_name', 'cpf', 'rg', 'blood_type', 'special_needs', 'medications', 'class', 'grade', 'phone', 'address', 'guardian_name', 'guardian_phone', 'guardian_email', 'emergency_contact'];
      for (const field of textFields) {
        if (body[field] !== undefined) {
          updateData[field] = body[field] ? sanitizeInput(String(body[field])) : null;
        }
      }
      // `status` is an enum-like string, validate against allowed values
      if (body.status !== undefined) {
        updateData.status = body.status === 'active' || body.status === 'inactive' ? body.status : 'active';
      }
      // `image_authorization` is an enum-like string, validate against allowed values
      if (body.image_authorization !== undefined) {
        const validAuthValues = ['authorized', 'not_authorized', 'pending'];
        updateData.image_authorization = validAuthValues.includes(body.image_authorization) ? body.image_authorization : 'pending';
      }
      // `photo` is a base64 data URL — validate it starts with data:image/ or is null
      if (body.photo !== undefined) {
        const photo = body.photo ? String(body.photo) : null;
        if (photo && !photo.startsWith('data:image/')) {
          return NextResponse.json(
            { error: 'Foto inválida' },
            { status: 400 }
          );
        }
        updateData.photo = photo;
      }

      // Handle school_id separately — don't allow setting it to null/empty
      if (body.school_id !== undefined) {
        if (!body.school_id || body.school_id.trim() === '') {
          return NextResponse.json(
            { error: 'Escola é obrigatória' },
            { status: 400 }
          );
        }
        if (body.school_id !== existingStudent.school_id) {
          const school = await db.school.findUnique({ where: { id: body.school_id } });
          if (!school) {
            return NextResponse.json(
              { error: 'Escola não encontrada' },
              { status: 404 }
            );
          }
        }
        updateData.school_id = body.school_id;
      }

      if (body.date_of_birth !== undefined) {
        updateData.date_of_birth = body.date_of_birth ? new Date(body.date_of_birth) : null;
      }

      // NOTE: Neon HTTP adapter does not support transactions. Prisma's
      // `update` with `include` (relation) triggers an implicit transaction,
      // so we split it: update first (scalar fields only), then fetch the
      // student + school relation in a separate query.
      const updated = await db.student.update({
        where: { id },
        data: updateData,
      });

      const student = await db.student.findUnique({
        where: { id: updated.id },
        include: {
          school: {
            select: { id: true, name: true },
          },
        },
      });

      await logAction(_req.user!.userId, 'update_student', `Aluno atualizado: ${updated.full_name}`, _req);

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

      // NOTE: Neon HTTP adapter does not support $transaction. Cascade
      // delete sequentially instead.
      await db.eventParticipant.deleteMany({ where: { student_id: id } });
      await db.attendanceRecord.deleteMany({ where: { student_id: id } });
      await db.student.delete({ where: { id } });

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
