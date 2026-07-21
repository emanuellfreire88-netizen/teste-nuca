import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds } from '@/lib/user-schools';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/students/authorization-events
 *
 * Lists events from both CalendarEvent and Event models,
 * combining them into a unified list for the Authorization PDF dialog's event selector.
 *
 * Query params:
 *   school_id?: string  — filter by school
 *   search?: string     — search by title
 *   upcoming?: string   — if "true", only show events from today onwards
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const school_id = searchParams.get('school_id') || '';
    const search = searchParams.get('search') || '';
    const upcoming = searchParams.get('upcoming') === 'true';

    const allowedSchoolIds = await getUserSchoolIds(req.user!.userId, req.user!.role);

    // Build where for CalendarEvent
    const calWhere: Record<string, unknown> = {};
    if (search) {
      calWhere.title = { contains: search, mode: 'insensitive' };
    }
    if (upcoming) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      calWhere.date = { gte: today };
    }
    if (allowedSchoolIds !== null) {
      if (school_id) {
        if (!allowedSchoolIds.includes(school_id)) {
          return NextResponse.json({ events: [] });
        }
        calWhere.school_id = school_id;
      } else {
        // Non-admin: only their schools + no school
        const schoolFilter = { OR: [{ school_id: { in: allowedSchoolIds } }, { school_id: null }] };
        if (upcoming || search) {
          calWhere.AND = [
            schoolFilter,
            ...(upcoming ? [{ date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }] : []),
            ...(search ? [{ title: { contains: search, mode: 'insensitive' } }] : []),
          ];
        } else {
          calWhere.OR = schoolFilter.OR;
        }
      }
    } else if (school_id) {
      calWhere.school_id = school_id;
    }

    // Build where for Event
    const evWhere: Record<string, unknown> = {};
    if (search) {
      evWhere.title = { contains: search, mode: 'insensitive' };
    }
    if (upcoming) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      evWhere.date = { gte: today };
    }
    if (allowedSchoolIds !== null) {
      if (school_id) {
        evWhere.school_id = school_id;
      } else {
        const schoolFilter = { OR: [{ school_id: { in: allowedSchoolIds } }, { school_id: null }] };
        if (upcoming || search) {
          evWhere.AND = [
            schoolFilter,
            ...(upcoming ? [{ date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }] : []),
            ...(search ? [{ title: { contains: search, mode: 'insensitive' } }] : []),
          ];
        } else {
          evWhere.OR = schoolFilter.OR;
        }
      }
    } else if (school_id) {
      evWhere.school_id = school_id;
    }

    const [calendarEvents, events] = await Promise.all([
      db.calendarEvent.findMany({
        where: calWhere,
        select: {
          id: true,
          title: true,
          description: true,
          date: true,
          end_date: true,
          type: true,
          location: true,
          departure_time: true,
          return_time: true,
          responsible_name: true,
          departure_point: true,
          transport: true,
          observations: true,
          school_id: true,
          school: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
        take: 50,
      }),
      db.event.findMany({
        where: evWhere,
        select: {
          id: true,
          title: true,
          description: true,
          date: true,
          location: true,
          status: true,
          category: true,
          school_id: true,
          school: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
        take: 50,
      }),
    ]);

    // Map CalendarEvent records
    const calItems = calendarEvents.map((ce) => ({
      id: ce.id,
      source: 'calendar' as const,
      title: ce.title,
      description: ce.description,
      date: ce.date,
      end_date: ce.end_date,
      type: ce.type,
      location: ce.location,
      departure_time: ce.departure_time,
      return_time: ce.return_time,
      responsible_name: ce.responsible_name,
      departure_point: ce.departure_point,
      transport: ce.transport,
      observations: ce.observations,
      school_id: ce.school_id,
      school_name: ce.school?.name ?? null,
    }));

    // Map Event records
    const evItems = events.map((ev) => ({
      id: ev.id,
      source: 'events' as const,
      title: ev.title,
      description: ev.description,
      date: ev.date,
      end_date: null as string | null,
      type: 'event' as const,
      location: ev.location,
      departure_time: null as string | null,
      return_time: null as string | null,
      responsible_name: null as string | null,
      departure_point: null as string | null,
      transport: null as string | null,
      observations: null as string | null,
      school_id: ev.school_id,
      school_name: ev.school?.name ?? null,
      status: ev.status,
      category: ev.category,
    }));

    // Sort combined by date descending
    const combined = [...calItems, ...evItems].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return NextResponse.json({ events: combined });
  } catch (error) {
    console.error('List authorization events error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
