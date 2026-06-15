import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

// ---------------------------------------------------------------------------
// PUT /api/support/tickets/[id]/read — Mark all messages as read for current user
// ---------------------------------------------------------------------------
export async function PUT(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;

      const ticket = await db.supportTicket.findUnique({
        where: { id },
        select: { id: true, protocol: true, user_id: true },
      });

      if (!ticket) {
        return NextResponse.json(
          { error: 'Ticket não encontrado' },
          { status: 404 }
        );
      }

      // Non-admin users can only mark their own tickets as read
      const isAdminOrOperator = _req.user!.role === 'Admin' || _req.user!.role === 'Operator';
      if (!isAdminOrOperator && ticket.user_id !== _req.user!.userId) {
        return NextResponse.json(
          { error: 'Permissão insuficiente' },
          { status: 403 }
        );
      }

      // Mark all messages NOT sent by the current user as read
      const result = await db.supportMessage.updateMany({
        where: {
          ticket_id: id,
          sender_id: { not: _req.user!.userId },
          is_read: false,
        },
        data: { is_read: true },
      });

      await logAction(
        _req.user!.userId,
        'mark_ticket_read',
        `Mensagens do ticket ${ticket.protocol} marcadas como lidas (${result.count} mensagens)`,
        _req
      );

      return NextResponse.json({
        message: 'Mensagens marcadas como lidas',
        count: result.count,
      });
    } catch (error) {
      console.error('Mark ticket read error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}
