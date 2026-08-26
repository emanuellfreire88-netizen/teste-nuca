import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { z } from 'zod';

const bulkSchema = z.object({
  action: z.enum(['present_all', 'absent_all', 'invert', 'set_selected']),
  attended: z.boolean().optional(),
  student_ids: z.array(z.string()).optional(),
});

// PATCH: Bulk update attendance for event participants.
// Actions:
//   - present_all    : mark every participant as attended=true
//   - absent_all     : mark every participant as attended=false
//   - invert         : flip attended value for every participant
//   - set_selected   : mark only the supplied student_ids as attended=<attended>
export async function PATCH(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin'], async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;
      const body = await _req.json();
      const parsed = bulkSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Parâmetros inválidos', details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { action, attended, student_ids } = parsed.data;

      // Verify the event exists
      const event = await db.event.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!event) {
        return NextResponse.json(
          { error: 'Evento não encontrado' },
          { status: 404 }
        );
      }

      let updatedCount = 0;

      if (action === 'present_all') {
        const result = await db.eventParticipant.updateMany({
          where: { event_id: id, attended: { not: true } },
          data: { attended: true },
        });
        updatedCount = result.count;
      } else if (action === 'absent_all') {
        const result = await db.eventParticipant.updateMany({
          where: { event_id: id, attended: true },
          data: { attended: false },
        });
        updatedCount = result.count;
      } else if (action === 'invert') {
        // We need to flip each row individually because updateMany
        // cannot reference the current column value.
        const participants = await db.eventParticipant.findMany({
          where: { event_id: id },
          select: { student_id: true, attended: true },
        });
        await db.$transaction(
          participants.map((p) =>
            db.eventParticipant.update({
              where: {
                event_id_student_id: {
                  event_id: id,
                  student_id: p.student_id,
                },
              },
              data: { attended: !p.attended },
            })
          )
        );
        updatedCount = participants.length;
      } else if (action === 'set_selected') {
        if (!student_ids || student_ids.length === 0) {
          return NextResponse.json(
            { error: 'Lista de alunos é obrigatória para set_selected' },
            { status: 400 }
          );
        }
        if (attended === undefined) {
          return NextResponse.json(
            { error: 'Valor de presença é obrigatório para set_selected' },
            { status: 400 }
          );
        }
        const result = await db.eventParticipant.updateMany({
          where: { event_id: id, student_id: { in: student_ids } },
          data: { attended },
        });
        updatedCount = result.count;
      }

      return NextResponse.json({ updated: updatedCount, action });
    } catch (error) {
      console.error('Bulk update participants error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}
