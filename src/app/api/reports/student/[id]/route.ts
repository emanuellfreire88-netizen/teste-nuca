import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { canUserAccessSchool } from '@/lib/user-schools';

export async function GET(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin', 'Operator'], async (_req: AuthenticatedRequest) => {
  try {
    const { id } = await context.params;

    // Fetch student with school info
    const student = await db.student.findUnique({
      where: { id },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            email: true,
            director_name: true,
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        { error: 'Não encontrado' },
        { status: 404 }
      );
    }

    // VULN-2 FIX: verify the caller's school scope before exposing full PII.
    // Use a generic 404 message so we don't reveal that the resource exists.
    const canAccess = await canUserAccessSchool(
      _req.user!.userId,
      _req.user!.role,
      student.school_id
    );
    if (!canAccess) {
      return NextResponse.json(
        { error: 'Não encontrado' },
        { status: 404 }
      );
    }

    // Fetch all event participations for this student
    const participations = await db.eventParticipant.findMany({
      where: { student_id: id },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            date: true,
            location: true,
            status: true,
            description: true,
          },
        },
      },
      orderBy: { event: { date: 'desc' } },
    });

    // Build events list
    const events = participations.map((p) => ({
      id: p.event.id,
      title: p.event.title,
      date: p.event.date.toISOString(),
      location: p.event.location || null,
      status: p.event.status,
      attended: p.attended,
      notes: p.notes || null,
    }));

    // Attendance summary
    const totalEvents = events.length;
    const attendedCount = events.filter((e) => e.attended).length;
    const attendanceRate = totalEvents > 0
      ? Math.round((attendedCount / totalEvents) * 100)
      : 0;

    // Build student info
    const studentInfo = {
      id: student.id,
      full_name: student.full_name,
      cpf: student.cpf || null,
      rg: student.rg || null,
      date_of_birth: student.date_of_birth ? student.date_of_birth.toISOString() : null,
      blood_type: student.blood_type || null,
      special_needs: student.special_needs || null,
      medications: student.medications || null,
      class: student.class || null,
      grade: student.grade || null,
      phone: student.phone || null,
      address: student.address || null,
      guardian_name: student.guardian_name || null,
      guardian_phone: student.guardian_phone || null,
      guardian_email: student.guardian_email || null,
      emergency_contact: student.emergency_contact || null,
      status: student.status,
      photo: student.photo || null,
    };

    // School info
    const schoolInfo = {
      id: student.school.id,
      name: student.school.name,
      address: student.school.address || null,
      phone: student.school.phone || null,
      email: student.school.email || null,
      director_name: student.school.director_name || null,
    };

    await logAction(
      _req.user!.userId,
      'export_report',
      `Relatório individual do aluno: ${student.full_name}`,
      _req
    );

    return NextResponse.json({
      student: studentInfo,
      school: schoolInfo,
      events,
      attendance_summary: {
        total_events: totalEvents,
        attended_count: attendedCount,
        absent_count: totalEvents - attendedCount,
        attendance_rate: attendanceRate,
      },
    });
  } catch (error) {
    console.error('Student report error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
  })(req, context);
}
