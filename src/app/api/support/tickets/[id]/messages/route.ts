import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

// ---------------------------------------------------------------------------
// GET /api/support/tickets/[id]/messages — List messages for a ticket
// ---------------------------------------------------------------------------
export async function GET(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;

      const ticket = await db.supportTicket.findUnique({
        where: { id },
        select: { id: true, user_id: true, status: true },
      });

      if (!ticket) {
        return NextResponse.json(
          { error: 'Ticket não encontrado' },
          { status: 404 }
        );
      }

      // Only Admin can view messages of any ticket (including resolved/closed).
      // Non-admin users can only view messages of their own ACTIVE tickets.
      const isAdmin = _req.user!.role === 'Admin';
      if (!isAdmin) {
        if (ticket.user_id !== _req.user!.userId) {
          return NextResponse.json(
            { error: 'Permissão insuficiente' },
            { status: 403 }
          );
        }
        if (ticket.status === 'resolved' || ticket.status === 'closed') {
          return NextResponse.json(
            { error: 'Ticket não disponível para visualização' },
            { status: 403 }
          );
        }
      }

      const { searchParams } = new URL(_req.url);
      const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
      const rawLimit = parseInt(searchParams.get('limit') || '20');
      const limit = Math.min(Math.max(1, rawLimit), 100);
      const skip = (page - 1) * limit;

      const [messages, total] = await Promise.all([
        db.supportMessage.findMany({
          where: { ticket_id: id },
          select: {
            id: true,
            ticket_id: true,
            sender_id: true,
            content: true,
            is_read: true,
            created_at: true,
            sender: {
              select: {
                id: true,
                full_name: true,
                email: true,
                profile_photo: true,
                role: true,
              },
            },
          },
          orderBy: { created_at: 'asc' },
          skip,
          take: limit,
        }),
        db.supportMessage.count({ where: { ticket_id: id } }),
      ]);

      return NextResponse.json({
        messages,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('List support messages error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}

// ---------------------------------------------------------------------------
// POST /api/support/tickets/[id]/messages — Send a message to a ticket
// ---------------------------------------------------------------------------
export async function POST(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;

      const ticket = await db.supportTicket.findUnique({
        where: { id },
        select: { id: true, protocol: true, user_id: true, status: true },
      });

      if (!ticket) {
        return NextResponse.json(
          { error: 'Ticket não encontrado' },
          { status: 404 }
        );
      }

      // Only Admin can send messages to any ticket.
      // Non-admin users can only send to their own ACTIVE tickets (open/in_progress).
      const isAdmin = _req.user!.role === 'Admin';
      if (!isAdmin) {
        if (ticket.user_id !== _req.user!.userId) {
          return NextResponse.json(
            { error: 'Permissão insuficiente' },
            { status: 403 }
          );
        }
        if (ticket.status === 'resolved' || ticket.status === 'closed') {
          return NextResponse.json(
            { error: 'Não é possível enviar mensagens neste ticket' },
            { status: 400 }
          );
        }
      }

      // Prevent sending messages to closed tickets (admin included)
      if (ticket.status === 'closed') {
        return NextResponse.json(
          { error: 'Não é possível enviar mensagens em um ticket fechado' },
          { status: 400 }
        );
      }

      const body = await _req.json();
      const { content } = body;

      if (!content || !content.trim()) {
        return NextResponse.json(
          { error: 'Conteúdo da mensagem é obrigatório' },
          { status: 400 }
        );
      }

      // Mark all other messages in the ticket as read
      await db.supportMessage.updateMany({
        where: {
          ticket_id: id,
          sender_id: { not: _req.user!.userId },
          is_read: false,
        },
        data: { is_read: true },
      });

      // Create the new message
      const message = await db.supportMessage.create({
        data: {
          ticket_id: id,
          sender_id: _req.user!.userId,
          content: content.trim(),
        },
        select: {
          id: true,
          ticket_id: true,
          sender_id: true,
          content: true,
          is_read: true,
          created_at: true,
          sender: {
            select: {
              id: true,
              full_name: true,
              email: true,
              profile_photo: true,
              role: true,
            },
          },
        },
      });

      await logAction(
        _req.user!.userId,
        'send_support_message',
        `Mensagem enviada no ticket ${ticket.protocol}`,
        _req
      );

      return NextResponse.json({ message }, { status: 201 });
    } catch (error) {
      console.error('Send support message error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}
