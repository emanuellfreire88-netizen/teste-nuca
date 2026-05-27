import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { sanitizeInput } from '@/lib/auth';
import { logAction } from '@/lib/logger';

export async function PUT(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string; studentId: string }> }
) {
  return withRole(['Admin', 'Operator'], async (_req: AuthenticatedRequest) => {
    try {
      const { id, studentId } = await context.params;
      const body = await _req.json();

      // Verify participation exists
      const participation = await db.eventParticipant.findUnique({
        where: {
          event_id_student_id: {
            event_id: id,
            student_id: studentId,
          },
        },
      });

      if (!participation) {
        return NextResponse.json(
          { error: 'Participação não encontrada' },
          { status: 404 }
        );
      }

      const updateData: Record<string, unknown> = {};
      if (body.attended !== undefined) updateData.attended = Boolean(body.attended);
      if (body.notes !== undefined) updateData.notes = body.notes ? sanitizeInput(body.notes) : null;

      const updated = await db.eventParticipant.update({
        where: {
          event_id_student_id: {
            event_id: id,
            student_id: studentId,
          },
        },
        data: updateData,
        include: {
          student: {
            select: {
              id: true,
              full_name: true,
              class: true,
              grade: true,
            },
          },
          event: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      await logAction(
        _req.user!.userId,
        'update_event_participation',
        `Participação atualizada: ${updated.student.full_name} no evento ${updated.event.title}`,
        _req
      );

      return NextResponse.json({ participation: updated });
    } catch (error) {
      console.error('Update event participation error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}

export async function DELETE(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string; studentId: string }> }
) {
  return withRole(['Admin', 'Operator'], async (_req: AuthenticatedRequest) => {
    try {
      const { id, studentId } = await context.params;

      // Verify participation exists
      const participation = await db.eventParticipant.findUnique({
        where: {
          event_id_student_id: {
            event_id: id,
            student_id: studentId,
          },
        },
        include: {
          student: { select: { full_name: true } },
          event: { select: { title: true } },
        },
      });

      if (!participation) {
        return NextResponse.json(
          { error: 'Participação não encontrada' },
          { status: 404 }
        );
      }

      await db.eventParticipant.delete({
        where: {
          event_id_student_id: {
            event_id: id,
            student_id: studentId,
          },
        },
      });

      await logAction(
        _req.user!.userId,
        'remove_event_participation',
        `Aluno ${participation.student.full_name} removido do evento: ${participation.event.title}`,
        _req
      );

      return NextResponse.json({ message: 'Participação removida com sucesso' });
    } catch (error) {
      console.error('Remove event participation error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}
