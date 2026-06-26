import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/certificates/events
 *
 * PUBLIC endpoint (no authentication required). Returns the list of events
 * that the admin has explicitly published to the public certificate link —
 * i.e. events where `public_certificates = true` AND status is "completed"
 * AND have at least one participant marked as attended.
 *
 * Admins control which events appear on the public link via a toggle in
 * the Events management page. This ensures only curated events are
 * publicly searchable.
 *
 * Privacy: only event id, title, date, location, category and school name
 * are exposed. No student data is returned by this endpoint.
 */
export async function GET() {
  try {
    const events = await db.event.findMany({
      where: {
        public_certificates: true,
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
