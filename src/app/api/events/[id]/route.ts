import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { sanitizeInput } from '@/lib/auth';
import { logAction } from '@/lib/logger';
import { canUserAccessSchool } from '@/lib/user-schools';

const VALID_CATEGORIES = ['sports', 'cultural', 'party', 'academic', 'other'];
const VALID_STATUSES = ['upcoming', 'ongoing', 'completed', 'cancelled'];

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

      // VULN-4 FIX: if the event belongs to a specific school, verify the
      // caller has access to that school. Events without a school_id are
      // considered cross-school / global and remain accessible to all.
      if (event.school_id) {
        const canAccess = await canUserAccessSchool(
          _req.user!.userId,
          _req.user!.role,
          event.school_id
        );
        if (!canAccess) {
          return NextResponse.json(
            { error: 'Não encontrado' },
            { status: 404 }
          );
        }
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

      const validStatuses = VALID_STATUSES;
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
      // VULN-8 FIX: sanitize free-text fields to prevent stored XSS.
      // `photo_url` is a URL/data-URL and is validated but NOT sanitized (would break it).
      // `status` and `category` are enum-like and validated above — assign as-is.
      const textFields = ['title', 'description', 'location'];
      for (const field of textFields) {
        if (body[field] !== undefined) {
          updateData[field] = body[field] ? sanitizeInput(String(body[field])) : null;
        }
      }
      if (body.status !== undefined) updateData.status = body.status;
      if (body.category !== undefined) updateData.category = body.category;
      // Validate photo_url: must start with http(s)://, data:image/, or be null
      if (body.photo_url !== undefined) {
        const photoUrl = body.photo_url ? String(body.photo_url) : null;
        if (photoUrl && !/^https?:\/\//i.test(photoUrl) && !photoUrl.startsWith('data:image/')) {
          return NextResponse.json(
            { error: 'URL da foto inválida' },
            { status: 400 }
          );
        }
        updateData.photo_url = photoUrl;
      }
      if (body.date !== undefined) updateData.date = new Date(body.date);
      if (body.school_id !== undefined) updateData.school_id = body.school_id || null;
      if (body.public_certificates !== undefined) {
        updateData.public_certificates = Boolean(body.public_certificates);
      }

      // NOTE: Neon HTTP adapter does not support transactions. Prisma wraps
      // update+include in an implicit transaction, so we split into a plain
      // UPDATE (no include) + a separate findUnique to fetch relations.
      const updated = await db.event.update({
        where: { id },
        data: updateData,
      });

      const event = await db.event.findUnique({
        where: { id: updated.id },
        include: {
          creator: {
            select: { id: true, full_name: true },
          },
          school: {
            select: { id: true, name: true },
          },
        },
      });

      await logAction(_req.user!.userId, 'update_event', `Evento atualizado: ${updated.title}`, _req);

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
