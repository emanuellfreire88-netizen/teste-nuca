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
      const school = await db.school.findUnique({
        where: { id },
        include: {
          students: {
            orderBy: { full_name: 'asc' },
          },
        },
      });

      if (!school) {
        return NextResponse.json(
          { error: 'Escola não encontrada' },
          { status: 404 }
        );
      }

      return NextResponse.json({ school });
    } catch (error) {
      console.error('Get school error:', error);
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

      const existingSchool = await db.school.findUnique({ where: { id } });
      if (!existingSchool) {
        return NextResponse.json(
          { error: 'Escola não encontrada' },
          { status: 404 }
        );
      }

      const updateData: Record<string, unknown> = {};
      const fields = ['name', 'address', 'phone', 'email', 'director_name', 'opening_hours', 'school_photo'];
      for (const field of fields) {
        if (body[field] !== undefined) updateData[field] = body[field];
      }
      if (body.latitude !== undefined) updateData.latitude = body.latitude;
      if (body.longitude !== undefined) updateData.longitude = body.longitude;

      const school = await db.school.update({
        where: { id },
        data: updateData,
      });

      await logAction(_req.user!.userId, 'update_school', `Escola atualizada: ${school.name}`, _req);

      return NextResponse.json({ school });
    } catch (error) {
      console.error('Update school error:', error);
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

      const existingSchool = await db.school.findUnique({
        where: { id },
        include: { _count: { select: { students: true } } },
      });

      if (!existingSchool) {
        return NextResponse.json(
          { error: 'Escola não encontrada' },
          { status: 404 }
        );
      }

      if (existingSchool._count.students > 0) {
        // Cascade: delete attendance records for all students, then students, then school
        const studentIds = (await db.student.findMany({
          where: { school_id: id },
          select: { id: true },
        })).map(s => s.id);

        if (studentIds.length > 0) {
          await db.attendanceRecord.deleteMany({
            where: { student_id: { in: studentIds } },
          });
          await db.student.deleteMany({
            where: { school_id: id },
          });
        }
      }

      await db.school.delete({ where: { id } });

      await logAction(_req.user!.userId, 'delete_school', `Escola excluída: ${existingSchool.name}`, _req);

      return NextResponse.json({ message: 'Escola excluída com sucesso' });
    } catch (error) {
      console.error('Delete school error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}
