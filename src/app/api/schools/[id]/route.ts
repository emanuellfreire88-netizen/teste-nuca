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

      // Validate field lengths on update
      if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length === 0 || body.name.length > 255)) {
        return NextResponse.json(
          { error: 'Nome da escola deve ter entre 1 e 255 caracteres' },
          { status: 400 }
        );
      }
      if (body.email !== undefined && body.email && body.email.length > 255) {
        return NextResponse.json(
          { error: 'E-mail deve ter no máximo 255 caracteres' },
          { status: 400 }
        );
      }
      // Validate latitude/longitude ranges
      if (body.latitude !== undefined && body.latitude !== null) {
        const lat = Number(body.latitude);
        if (isNaN(lat) || lat < -90 || lat > 90) {
          return NextResponse.json(
            { error: 'Latitude deve estar entre -90 e 90' },
            { status: 400 }
          );
        }
      }
      if (body.longitude !== undefined && body.longitude !== null) {
        const lng = Number(body.longitude);
        if (isNaN(lng) || lng < -180 || lng > 180) {
          return NextResponse.json(
            { error: 'Longitude deve estar entre -180 e 180' },
            { status: 400 }
          );
        }
      }

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

      // Use transaction for cascade delete to ensure data consistency
      await db.$transaction(async (tx) => {
        if (existingSchool._count.students > 0) {
          // Cascade: delete event participations, attendance records, then students, then school
          const studentIds = (await tx.student.findMany({
            where: { school_id: id },
            select: { id: true },
          })).map(s => s.id);

          if (studentIds.length > 0) {
            // Delete event participations for these students first
            await tx.eventParticipant.deleteMany({
              where: { student_id: { in: studentIds } },
            });
            await tx.attendanceRecord.deleteMany({
              where: { student_id: { in: studentIds } },
            });
            await tx.student.deleteMany({
              where: { school_id: id },
            });
          }
        }

        await tx.school.delete({ where: { id } });
      });

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
