import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/certificates/events
 *
 * PUBLIC endpoint (no authentication required). Returns the list of events
 * that have certificates available — i.e. events with status "completed"
 * that have at least one participant marked as attended.
 *
 * Used by the public certificate lookup page to populate the event filter
 * dropdown so a student can search their name within a specific event.
 *
 * Privacy: only event id, title, date, location, category and school name
 * are exposed. No student data is returned by this endpoint.
 */
export async function GET() {
  try {
    const events = await db.event.findMany({
      where: {
        status: 'completed',
        participants: { some: { attended: true } },
      },
      select: {
        id: true,
        title: true,
        date: true,
        location: true,
        category: true,
        school: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: 200, // Reasonable cap to prevent abuse
    });

    const result = events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      location: e.location,
      category: e.category,
      school_name: e.school?.name || null,
    }));

    return NextResponse.json({ events: result });
  } catch (error) {
    console.error('List certificate events error:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar eventos' },
      { status: 500 }
    );
  }
}
