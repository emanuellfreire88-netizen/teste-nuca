import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

const VALID_CATEGORIES = ['sports', 'cultural', 'party', 'academic', 'other'];

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const rawLimit = parseInt(searchParams.get('limit') || '10');
    const limit = Math.min(Math.max(1, rawLimit), 100);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const student_id = searchParams.get('student_id') || '';
    const school_id = searchParams.get('school_id') || '';
    const category = searchParams.get('category') || '';
    const date_from = searchParams.get('date_from') || '';
    const date_to = searchParams.get('date_to') || '';

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

    if (school_id) {
      where.school_id = school_id;
    }

    if (category) {
      where.category = category;
    }

    if (date_from || date_to) {
      const dateFilter: Record<string, unknown> = {};
      if (date_from) dateFilter.gte = new Date(date_from);
      if (date_to) dateFilter.lte = new Date(date_to);
      where.date = dateFilter;
    }

    const [events, total] = await Promise.all([
      db.event.findMany({
        where,
        include: {
          creator: {
            select: { id: true, full_name: true },
          },
          school: {
            select: { id: true, name: true },
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
    const { title, description, date, location, status, photo_url, school_id, category } = body;

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

    const eventCategory = category || 'other';
    if (!VALID_CATEGORIES.includes(eventCategory)) {
      return NextResponse.json(
        { error: 'Categoria inválida. Valores permitidos: sports, cultural, party, academic, other' },
        { status: 400 }
      );
    }

    if (school_id) {
      const school = await db.school.findUnique({ where: { id: school_id } });
      if (!school) {
        return NextResponse.json(
          { error: 'Escola não encontrada' },
          { status: 400 }
        );
      }
    }

    const event = await db.event.create({
      data: {
        title,
        description: description || null,
        date: new Date(date),
        location: location || null,
        status: eventStatus,
        created_by: req.user!.userId,
        photo_url: photo_url || null,
        school_id: school_id || null,
        category: eventCategory,
      },
      include: {
        creator: {
          select: { id: true, full_name: true },
        },
        school: {
          select: { id: true, name: true },
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
