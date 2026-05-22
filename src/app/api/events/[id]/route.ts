import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

const VALID_CATEGORIES = ['sports', 'cultural', 'party', 'academic', 'other'];

export async function GET(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;
      const event = await db.event.findUnique({
        where: { id },
        include: {
          creator: {
            select: { id: true, full_name: true },
          },
          school: {
            select: { id: true, name: true },
          },
          participants: {
            include: {
              student: {
                select: {
                  id: true,
                  full_name: true,
                  grade: true,
                  class: true,
                  photo: true,
                  school: {
                    select: { id: true, name: true },
                  },
                },
              },
            },
            orderBy: { student: { full_name: 'asc' } },
          },
        },
      });

      if (!event) {
        return NextResponse.json(
          { error: 'Evento não encontrado' },
          { status: 404 }
        );
      }

      return NextResponse.json({ event });
    } catch (error) {
      console.error('Get event error:', error);
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

      const existingEvent = await db.event.findUnique({ where: { id } });
      if (!existingEvent) {
        return NextResponse.json(
          { error: 'Evento não encontrado' },
          { status: 404 }
        );
      }

      if (body.title !== undefined && (typeof body.title !== 'string' || body.title.trim().length === 0 || body.title.length > 255)) {
        return NextResponse.json(
          { error: 'Título deve ter entre 1 e 255 caracteres' },
          { status: 400 }
        );
      }

      const validStatuses = ['upcoming', 'ongoing', 'completed', 'cancelled'];
      if (body.status !== undefined && !validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: 'Status inválido' },
          { status: 400 }
        );
      }

      if (body.category !== undefined && !VALID_CATEGORIES.includes(body.category)) {
        return NextResponse.json(
          { error: 'Categoria inválida. Valores permitidos: sports, cultural, party, academic, other' },
          { status: 400 }
        );
      }

      if (body.school_id !== undefined && body.school_id !== null) {
        const school = await db.school.findUnique({ where: { id: body.school_id } });
        if (!school) {
          return NextResponse.json(
            { error: 'Escola não encontrada' },
            { status: 400 }
          );
        }
      }

      const updateData: Record<string, unknown> = {};
      const fields = ['title', 'description', 'location', 'status', 'photo_url', 'category'];
      for (const field of fields) {
        if (body[field] !== undefined) updateData[field] = body[field];
      }
      if (body.date !== undefined) updateData.date = new Date(body.date);
      if (body.school_id !== undefined) updateData.school_id = body.school_id || null;

      const event = await db.event.update({
        where: { id },
        data: updateData,
        include: {
          creator: {
            select: { id: true, full_name: true },
          },
          school: {
            select: { id: true, name: true },
          },
        },
      });

      await logAction(_req.user!.userId, 'update_event', `Evento atualizado: ${event.title}`, _req);

      return NextResponse.json({ event });
    } catch (error) {
      console.error('Update event error:', error);
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

      const existingEvent = await db.event.findUnique({ where: { id } });
      if (!existingEvent) {
        return NextResponse.json(
          { error: 'Evento não encontrado' },
          { status: 404 }
        );
      }

      // Delete participants first (cascade)
      await db.eventParticipant.deleteMany({
        where: { event_id: id },
      });

      await db.event.delete({ where: { id } });

      await logAction(_req.user!.userId, 'delete_event', `Evento excluído: ${existingEvent.title}`, _req);

      return NextResponse.json({ message: 'Evento excluído com sucesso' });
    } catch (error) {
      console.error('Delete event error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}
