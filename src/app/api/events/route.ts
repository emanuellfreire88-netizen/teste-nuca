import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const rawLimit = parseInt(searchParams.get('limit') || '10');
    const limit = Math.min(Math.max(1, rawLimit), 100);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const student_id = searchParams.get('student_id') || '';

    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (search) {
      where.title = { contains: search };
    }

    if (status) {
      where.status = status;
    }

    if (student_id) {
      where.participants = {
        some: { student_id },
      };
    }

    const [events, total] = await Promise.all([
      db.event.findMany({
        where,
        include: {
          creator: {
            select: { id: true, full_name: true },
          },
          _count: {
            select: { participants: true },
          },
          ...(student_id ? {
            participants: {
              where: { student_id },
              select: { attended: true, notes: true },
            },
          } : {}),
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      db.event.count({ where }),
    ]);

    const result = events.map(({ _count, participants: eventParticipants, ...event }) => ({
      ...event,
      participant_count: _count.participants,
      ...(student_id && eventParticipants ? {
        student_attended: eventParticipants[0]?.attended ?? false,
        student_notes: eventParticipants[0]?.notes ?? null,
      } : {}),
    }));

    return NextResponse.json({
      events: result,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List events error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

export const POST = withRole(['Admin'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const { title, description, date, location, status } = body;

    if (!title) {
      return NextResponse.json(
        { error: 'Título do evento é obrigatório' },
        { status: 400 }
      );
    }

    if (!date) {
      return NextResponse.json(
        { error: 'Data do evento é obrigatória' },
        { status: 400 }
      );
    }

    if (title.length > 255) {
      return NextResponse.json(
        { error: 'Título deve ter no máximo 255 caracteres' },
        { status: 400 }
      );
    }

    const validStatuses = ['upcoming', 'ongoing', 'completed', 'cancelled'];
    const eventStatus = status || 'upcoming';
    if (!validStatuses.includes(eventStatus)) {
      return NextResponse.json(
        { error: 'Status inválido' },
        { status: 400 }
      );
    }

    const event = await db.event.create({
      data: {
        title,
        description: description || null,
        date: new Date(date),
        location: location || null,
        status: eventStatus,
        created_by: req.user!.userId,
      },
      include: {
        creator: {
          select: { id: true, full_name: true },
        },
      },
    });

    await logAction(req.user!.userId, 'create_event', `Evento criado: ${title}`, req);

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error('Create event error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
