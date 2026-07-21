import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { getUserSchoolIds } from '@/lib/user-schools';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_TYPES = ['event', 'reminder', 'holiday', 'meeting', 'announcement'];

// ---------------------------------------------------------------------------
// GET /api/calendar?month=YYYY-MM&school_id=...&type=...
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') || '';
    const school_id = searchParams.get('school_id') || '';
    const type = searchParams.get('type') || '';

    // Validate month format (YYYY-MM)
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: 'Parâmetro "month" é obrigatório no formato YYYY-MM' },
        { status: 400 }
      );
    }

    // Compute date range for the given month
    const [year, mon] = month.split('-').map(Number);
    const startOfMonth = new Date(year, mon - 1, 1);
    const endOfMonth = new Date(year, mon, 1); // first day of next month

    // ── School scoping ──
    const allowedSchoolIds = await getUserSchoolIds(req.user!.userId, req.user!.role);

    // Build where clause for CalendarEvent
    const calendarWhere: Record<string, unknown> = {
      date: {
        gte: startOfMonth,
        lt: endOfMonth,
      },
    };

    if (type) {
      calendarWhere.type = type;
    }

    if (allowedSchoolIds !== null) {
      // Non-admin: only events for their schools + events with no school_id are visible
      if (school_id) {
        if (!allowedSchoolIds.includes(school_id)) {
          return NextResponse.json({ events: [] });
        }
        calendarWhere.school_id = school_id;
      } else {
        calendarWhere.OR = [
          { school_id: { in: allowedSchoolIds } },
          { school_id: null },
        ];
      }
    } else if (school_id) {
      // Admin explicitly filtering by school
      calendarWhere.school_id = school_id;
    }

    // Build where clause for existing Event records (unified view)
    const eventWhere: Record<string, unknown> = {
      date: {
        gte: startOfMonth,
        lt: endOfMonth,
      },
    };

    if (allowedSchoolIds !== null) {
      if (school_id) {
        if (!allowedSchoolIds.includes(school_id)) {
          // Already returned empty above for calendar, return empty for events too
          return NextResponse.json({ events: [] });
        }
        eventWhere.school_id = school_id;
      } else {
        eventWhere.OR = [
          { school_id: { in: allowedSchoolIds } },
          { school_id: null },
        ];
      }
    } else if (school_id) {
      eventWhere.school_id = school_id;
    }

    const [calendarEvents, existingEvents] = await Promise.all([
      db.calendarEvent.findMany({
        where: calendarWhere,
        include: {
          creator: {
            select: { id: true, full_name: true },
          },
          school: {
            select: { id: true, name: true },
          },
        },
        orderBy: { date: 'asc' },
      }),
      db.event.findMany({
        where: eventWhere,
        include: {
          creator: {
            select: { id: true, full_name: true },
          },
          school: {
            select: { id: true, name: true },
          },
        },
        orderBy: { date: 'asc' },
      }),
    ]);

    // Map CalendarEvent records
    const calendarItems = calendarEvents.map((ce) => ({
      id: ce.id,
      title: ce.title,
      description: ce.description,
      date: ce.date,
      end_date: ce.end_date,
      type: ce.type,
      color: ce.color,
      school_id: ce.school_id,
      created_by: ce.created_by,
      creator_name: ce.creator.full_name,
      school_name: ce.school?.name ?? null,
      created_at: ce.created_at,
      updated_at: ce.updated_at,
      source: 'calendar',
      location: ce.location,
      departure_time: ce.departure_time,
      return_time: ce.return_time,
      responsible_name: ce.responsible_name,
      observations: ce.observations,
    }));

    // Map existing Event records as unified calendar entries
    const eventItems = existingEvents.map((ev) => ({
      id: ev.id,
      title: ev.title,
      description: ev.description,
      date: ev.date,
      end_date: null,
      type: 'event' as const,
      color: null,
      school_id: ev.school_id,
      created_by: ev.created_by,
      creator_name: ev.creator.full_name,
      school_name: ev.school?.name ?? null,
      created_at: ev.created_at,
      updated_at: ev.updated_at,
      source: 'events',
      // Extra fields from Event model
      location: ev.location,
      status: ev.status,
      category: ev.category,
    }));

    return NextResponse.json({ events: [...calendarItems, ...eventItems] });
  } catch (error) {
    console.error('List calendar events error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/calendar  — Create a new CalendarEvent
// ---------------------------------------------------------------------------
export const POST = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const { title, description, date, end_date, type, color, school_id, location, departure_time, return_time, responsible_name, observations } = body;

    if (!title) {
      return NextResponse.json(
        { error: 'Título é obrigatório' },
        { status: 400 }
      );
    }

    if (!date) {
      return NextResponse.json(
        { error: 'Data é obrigatória' },
        { status: 400 }
      );
    }

    if (title.length > 255) {
      return NextResponse.json(
        { error: 'Título deve ter no máximo 255 caracteres' },
        { status: 400 }
      );
    }

    const eventType = type || 'event';
    if (!VALID_TYPES.includes(eventType)) {
      return NextResponse.json(
        { error: `Tipo inválido. Valores permitidos: ${VALID_TYPES.join(', ')}` },
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

    // Validate end_date is after date if provided
    if (end_date && new Date(end_date) < new Date(date)) {
      return NextResponse.json(
        { error: 'Data de término deve ser posterior à data de início' },
        { status: 400 }
      );
    }

    // NOTE: Neon HTTP adapter doesn't support transactions.
    // Split create + findUnique (same pattern as events/route.ts).
    const created = await db.calendarEvent.create({
      data: {
        title,
        description: description || null,
        date: new Date(date),
        end_date: end_date ? new Date(end_date) : null,
        type: eventType,
        color: color || null,
        school_id: school_id || null,
        created_by: req.user!.userId,
        location: location || null,
        departure_time: departure_time || null,
        return_time: return_time || null,
        responsible_name: responsible_name || null,
        observations: observations || null,
      },
    });

    const calendarEvent = await db.calendarEvent.findUnique({
      where: { id: created.id },
      include: {
        creator: {
          select: { id: true, full_name: true },
        },
        school: {
          select: { id: true, name: true },
        },
      },
    });

    await logAction(req.user!.userId, 'create_calendar_event', `Evento de calendário criado: ${title}`, req);

    return NextResponse.json({ event: calendarEvent }, { status: 201 });
  } catch (error) {
    console.error('Create calendar event error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

// ---------------------------------------------------------------------------
// PUT /api/calendar  — Update a CalendarEvent
// ---------------------------------------------------------------------------
export const PUT = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const { id, title, description, date, end_date, type, color, school_id, location, departure_time, return_time, responsible_name, observations } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'ID do evento é obrigatório' },
        { status: 400 }
      );
    }

    const existing = await db.calendarEvent.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Evento de calendário não encontrado' },
        { status: 404 }
      );
    }

    // Only the creator or an Admin can update
    if (existing.created_by !== req.user!.userId && req.user!.role !== 'Admin') {
      return NextResponse.json(
        { error: 'Permissão insuficiente para editar este evento' },
        { status: 403 }
      );
    }

    if (type && !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Tipo inválido. Valores permitidos: ${VALID_TYPES.join(', ')}` },
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

    // Validate end_date is after date if both are provided or one is being changed
    const effectiveDate = date ? new Date(date) : existing.date;
    const effectiveEndDate = end_date !== undefined
      ? (end_date ? new Date(end_date) : null)
      : existing.end_date;
    if (effectiveEndDate && effectiveEndDate < effectiveDate) {
      return NextResponse.json(
        { error: 'Data de término deve ser posterior à data de início' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description || null;
    if (date !== undefined) updateData.date = new Date(date);
    if (end_date !== undefined) updateData.end_date = end_date ? new Date(end_date) : null;
    if (type !== undefined) updateData.type = type;
    if (color !== undefined) updateData.color = color || null;
    if (school_id !== undefined) updateData.school_id = school_id || null;
    if (location !== undefined) updateData.location = location || null;
    if (departure_time !== undefined) updateData.departure_time = departure_time || null;
    if (return_time !== undefined) updateData.return_time = return_time || null;
    if (responsible_name !== undefined) updateData.responsible_name = responsible_name || null;
    if (observations !== undefined) updateData.observations = observations || null;

    await db.calendarEvent.update({
      where: { id },
      data: updateData,
    });

    const updated = await db.calendarEvent.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, full_name: true },
        },
        school: {
          select: { id: true, name: true },
        },
      },
    });

    await logAction(req.user!.userId, 'update_calendar_event', `Evento de calendário atualizado: ${updated?.title ?? id}`, req);

    return NextResponse.json({ event: updated });
  } catch (error) {
    console.error('Update calendar event error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/calendar  — Delete a CalendarEvent
// ---------------------------------------------------------------------------
export const DELETE = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'ID do evento é obrigatório' },
        { status: 400 }
      );
    }

    const existing = await db.calendarEvent.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Evento de calendário não encontrado' },
        { status: 404 }
      );
    }

    // Only the creator or an Admin can delete
    if (existing.created_by !== req.user!.userId && req.user!.role !== 'Admin') {
      return NextResponse.json(
        { error: 'Permissão insuficiente para excluir este evento' },
        { status: 403 }
      );
    }

    await db.calendarEvent.delete({
      where: { id },
    });

    await logAction(req.user!.userId, 'delete_calendar_event', `Evento de calendário excluído: ${existing.title}`, req);

    return NextResponse.json({ message: 'Evento de calendário excluído com sucesso' });
  } catch (error) {
    console.error('Delete calendar event error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
