import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/certificates/lookup?name=João
 *
 * PUBLIC endpoint (no authentication required). Lets a student search for
 * their name and see which events they participated in that have
 * certificates available (i.e. events with status "completed").
 *
 * Returns a list of students matching the name, each with their completed
 * events. Only exposes the minimum data needed for the public certificate
 * page: student full_name, event title/date/location, and a composite key
 * to download the certificate PDF.
 *
 * Privacy: we do NOT expose email, CPF, phone, or any sensitive field.
 * Only the student's full name + event info is returned.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const name = (searchParams.get('name') || '').trim();

    if (name.length < 2) {
      return NextResponse.json(
        { error: 'Digite pelo menos 2 caracteres para buscar' },
        { status: 400 }
      );
    }

    // Case-insensitive search on full_name (PostgreSQL ILIKE).
    // Limit results to prevent abuse / data scraping.
    const students = await db.student.findMany({
      where: {
        full_name: { contains: name, mode: 'insensitive' },
        // Only students who participated in at least one event
        event_participations: { some: {} },
      },
      select: {
        id: true,
        full_name: true,
        event_participations: {
          select: {
            attended: true,
            event: {
              select: {
                id: true,
                title: true,
                date: true,
                location: true,
                status: true,
                category: true,
                school: { select: { name: true } },
              },
            },
          },
          orderBy: { event: { date: 'desc' } },
        },
      },
      orderBy: { full_name: 'asc' },
      take: 20, // Cap at 20 students to prevent data scraping
    });

    // Filter: only show events that are "completed" (certificates available).
    // Also only show events where the student actually attended.
    const result = students.map((s) => ({
      id: s.id,
      full_name: s.full_name,
      certificates: s.event_participations
        .filter((ep) => ep.event.status === 'completed' && ep.attended)
        .map((ep) => ({
          event_id: ep.event.id,
          student_id: s.id,
          event_title: ep.event.title,
          event_date: ep.event.date,
          event_location: ep.event.location,
          event_category: ep.event.category,
          school_name: ep.event.school?.name || null,
        })),
    })).filter((s) => s.certificates.length > 0);

    return NextResponse.json({ students: result });
  } catch (error) {
    console.error('Certificate lookup error:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar certificados' },
      { status: 500 }
    );
  }
}
