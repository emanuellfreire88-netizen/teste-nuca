import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    // Rate limit public certificate lookup (ETAPA 12 — prevent enumeration)
    const rateLimitResult = applyRateLimit(req, 'cert_lookup', RATE_LIMITS.CERTIFICATE_LOOKUP);
    if (rateLimitResult) {
      return NextResponse.json(
        { error: rateLimitResult.body.error },
        { status: rateLimitResult.status, headers: { 'Retry-After': String(rateLimitResult.body.retryAfter) } }
      );
    }

    const { searchParams } = new URL(req.url);
    const name = (searchParams.get('name') || '').trim();
    const eventId = (searchParams.get('event_id') || '').trim();

    if (name.length < 2) {
      return NextResponse.json(
        { error: 'Digite pelo menos 2 caracteres para buscar' },
        { status: 400 }
      );
    }

    // Case-insensitive search on full_name (PostgreSQL ILIKE).
    // Limit results to prevent abuse / data scraping.
    // If event_id is provided, only return participations for that event.
    // Only events with public_certificates=true appear on the public link.
    const participationsWhere: Record<string, unknown> = {
      event: { public_certificates: true, status: 'completed' },
    };
    if (eventId) {
      participationsWhere.event_id = eventId;
    }

    const students = await db.student.findMany({
      where: {
        full_name: { contains: name, mode: 'insensitive' },
        // Only students who participated in at least one published event
        event_participations: { some: participationsWhere },
      },
      select: {
        id: true,
        full_name: true,
        event_participations: {
          where: eventId
            ? { event_id: eventId, event: { public_certificates: true, status: 'completed' } }
            : { event: { public_certificates: true, status: 'completed' } },
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

    // Filter: only show events where the student actually attended.
    // (The public_certificates + completed filters are already applied via
    // the where clause above, but we double-check attended here.)
    const result = students.map((s) => ({
      id: s.id,
      full_name: s.full_name,
      certificates: s.event_participations
        .filter((ep) => ep.attended)
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
