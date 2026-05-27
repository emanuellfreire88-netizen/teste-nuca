import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { sanitizeInput } from '@/lib/auth';
import { logAction } from '@/lib/logger';

export async function GET(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;

      // Verify event exists
      const event = await db.event.findUnique({ where: { id } });
      if (!event) {
        return NextResponse.json(
          { error: 'Evento não encontrado' },
          { status: 404 }
        );
      }

      const participations = await db.eventParticipation.findMany({
        where: { event_id: id },
        include: {
          student: {
            select: {
              id: true,
              full_name: true,
              class: true,
              grade: true,
              status: true,
              school: {
                select: { id: true, name: true },
              },
            },
          },
        },
        orderBy: { created_at: 'asc' },
      });

      return NextResponse.json({ participations });
    } catch (error) {
      console.error('List event participations error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}

export async function POST(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin', 'Operator'], async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;
      const body = await _req.json();

      // Verify event exists
      const event = await db.event.findUnique({ where: { id } });
      if (!event) {
        return NextResponse.json(
          { error: 'Evento não encontrado' },
          { status: 404 }
        );
      }

      const validStatuses = ['confirmed', 'attended', 'absent', 'cancelled'];

      // Support two modes:
      // 1. Array of student_ids: { student_ids: string[] }
      // 2. Single student: { student_id: string, status?: string, notes?: string }
      if (body.student_ids && Array.isArray(body.student_ids)) {
        const studentIds: string[] = body.student_ids;

        if (studentIds.length === 0) {
          return NextResponse.json(
            { error: 'Lista de alunos não pode ser vazia' },
            { status: 400 }
          );
        }

        if (studentIds.length > 500) {
          return NextResponse.json(
            { error: 'Limite de 500 alunos por requisição' },
            { status: 400 }
          );
        }

        // Verify all students exist
        const existingStudents = await db.student.findMany({
          where: { id: { in: studentIds } },
          select: { id: true },
        });

        const existingIds = new Set(existingStudents.map(s => s.id));
        const notFound = studentIds.filter(sid => !existingIds.has(sid));
        if (notFound.length > 0) {
          return NextResponse.json(
            { error: `Alunos não encontrados: ${notFound.join(', ')}` },
            { status: 404 }
          );
        }

        // Check which students are already participating
        const existingParticipations = await db.eventParticipation.findMany({
          where: {
            event_id: id,
            student_id: { in: studentIds },
          },
          select: { student_id: true },
        });

        const alreadyParticipating = new Set(existingParticipations.map(p => p.student_id));

        // Filter out already-participating students
        const newStudentIds = studentIds.filter(sid => !alreadyParticipating.has(sid));

        if (newStudentIds.length === 0) {
          return NextResponse.json(
            { error: 'Todos os alunos já estão inscritos neste evento' },
            { status: 409 }
          );
        }

        // Create participations in bulk
        const participationStatus = body.status && validStatuses.includes(body.status) ? body.status : 'confirmed';

        await db.$transaction(
          newStudentIds.map(studentId =>
            db.eventParticipation.create({
              data: {
                event_id: id,
                student_id: studentId,
                status: participationStatus,
              },
            })
          )
        );

        await logAction(
          _req.user!.userId,
          'add_event_participations',
          `${newStudentIds.length} aluno(s) adicionado(s) ao evento: ${event.title}`,
          _req
        );

        return NextResponse.json({
          message: `${newStudentIds.length} aluno(s) adicionado(s) ao evento`,
          added: newStudentIds.length,
          already_participating: alreadyParticipating.size,
        }, { status: 201 });
      } else if (body.student_id) {
        // Single student mode
        const { student_id, status, notes } = body;

        // Verify student exists
        const student = await db.student.findUnique({ where: { id: student_id } });
        if (!student) {
          return NextResponse.json(
            { error: 'Aluno não encontrado' },
            { status: 404 }
          );
        }

        // Check for existing participation (unique constraint on event_id + student_id)
        const existing = await db.eventParticipation.findUnique({
          where: {
            event_id_student_id: {
              event_id: id,
              student_id,
            },
          },
        });

        if (existing) {
          return NextResponse.json(
            { error: 'Aluno já está inscrito neste evento' },
            { status: 409 }
          );
        }

        const participationStatus = status && validStatuses.includes(status) ? status : 'confirmed';

        const participation = await db.eventParticipation.create({
          data: {
            event_id: id,
            student_id,
            status: participationStatus,
            notes: notes ? sanitizeInput(notes) : null,
          },
          include: {
            student: {
              select: {
                id: true,
                full_name: true,
                class: true,
                grade: true,
                status: true,
              },
            },
          },
        });

        await logAction(
          _req.user!.userId,
          'add_event_participation',
          `Aluno ${student.full_name} adicionado ao evento: ${event.title}`,
          _req
        );

        return NextResponse.json({ participation }, { status: 201 });
      } else {
        return NextResponse.json(
          { error: 'Forneça student_id ou student_ids' },
          { status: 400 }
        );
      }
    } catch (error) {
      console.error('Add event participation error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}
