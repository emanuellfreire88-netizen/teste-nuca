import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

// POST: Add students to event
export async function POST(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin'], async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;
      const body = await _req.json();
      const { student_ids } = body;

      if (!Array.isArray(student_ids) || student_ids.length === 0) {
        return NextResponse.json(
          { error: 'Lista de alunos é obrigatória' },
          { status: 400 }
        );
      }

      const existingEvent = await db.event.findUnique({ where: { id } });
      if (!existingEvent) {
        return NextResponse.json(
          { error: 'Evento não encontrado' },
          { status: 404 }
        );
      }

      // Check which students are already participants
      const existingParticipants = await db.eventParticipant.findMany({
        where: {
          event_id: id,
          student_id: { in: student_ids },
        },
        select: { student_id: true },
      });

      const existingIds = new Set(existingParticipants.map((p) => p.student_id));
      const newStudentIds = student_ids.filter((sid: string) => !existingIds.has(sid));

      if (newStudentIds.length > 0) {
        await db.eventParticipant.createMany({
          data: newStudentIds.map((student_id: string) => ({
            event_id: id,
            student_id,
          })),
        });
      }

      await logAction(
        _req.user!.userId,
        'add_event_participants',
        `Adicionados ${newStudentIds.length} alunos ao evento: ${existingEvent.title}`,
        _req
      );

      return NextResponse.json({
        message: `${newStudentIds.length} aluno(s) adicionado(s) ao evento`,
        added: newStudentIds.length,
        already_exists: existingIds.size,
      });
    } catch (error) {
      console.error('Add participants error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}

// DELETE: Remove student from event
export async function DELETE(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin'], async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;
      const body = await _req.json();
      const { student_id } = body;

      if (!student_id) {
        return NextResponse.json(
          { error: 'ID do aluno é obrigatório' },
          { status: 400 }
        );
      }

      const participant = await db.eventParticipant.findUnique({
        where: {
          event_id_student_id: {
            event_id: id,
            student_id,
          },
        },
      });

      if (!participant) {
        return NextResponse.json(
          { error: 'Participante não encontrado neste evento' },
          { status: 404 }
        );
      }

      await db.eventParticipant.delete({
        where: {
          event_id_student_id: {
            event_id: id,
            student_id,
          },
        },
      });

      const existingEvent = await db.event.findUnique({ where: { id } });

      await logAction(
        _req.user!.userId,
        'remove_event_participant',
        `Aluno removido do evento: ${existingEvent?.title || id}`,
        _req
      );

      return NextResponse.json({ message: 'Aluno removido do evento' });
    } catch (error) {
      console.error('Remove participant error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}

// PUT: Update participation status (attended, notes)
export async function PUT(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin'], async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;
      const body = await _req.json();
      const { student_id, attended, notes } = body;

      if (!student_id) {
        return NextResponse.json(
          { error: 'ID do aluno é obrigatório' },
          { status: 400 }
        );
      }

      const participant = await db.eventParticipant.findUnique({
        where: {
          event_id_student_id: {
            event_id: id,
            student_id,
          },
        },
      });

      if (!participant) {
        return NextResponse.json(
          { error: 'Participante não encontrado neste evento' },
          { status: 404 }
        );
      }

      const updateData: Record<string, unknown> = {};
      if (attended !== undefined) updateData.attended = attended;
      if (notes !== undefined) updateData.notes = notes;

      const updated = await db.eventParticipant.update({
        where: {
          event_id_student_id: {
            event_id: id,
            student_id,
          },
        },
        data: updateData,
      });

      return NextResponse.json({ participant: updated });
    } catch (error) {
      console.error('Update participant error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}
