import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
const validPriorities = ['low', 'normal', 'high', 'urgent'];

// ---------------------------------------------------------------------------
// GET /api/support/tickets/[id] — Get a single ticket with messages
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
        select: {
          id: true,
          protocol: true,
          subject: true,
          status: true,
          priority: true,
          user_id: true,
          assigned_to: true,
          created_at: true,
          updated_at: true,
          user: {
            select: {
              id: true,
              full_name: true,
              email: true,
            },
          },
          assignee: {
            select: {
              id: true,
              full_name: true,
              email: true,
            },
          },
          messages: {
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
                },
              },
            },
            orderBy: { created_at: 'asc' },
          },
        },
      });

      if (!ticket) {
        return NextResponse.json(
          { error: 'Ticket não encontrado' },
          { status: 404 }
        );
      }

      // Only Admin can view any ticket (including resolved/closed).
      // Non-admin users can only view their own ACTIVE tickets (open/in_progress).
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

      return NextResponse.json({ ticket });
    } catch (error) {
      console.error('Get support ticket error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}

// ---------------------------------------------------------------------------
// PUT /api/support/tickets/[id] — Update ticket (Admin only)
// Only Admin can change status, priority, or assignee (including reopening tickets).
// Operators no longer have permission to manage ticket status.
// ---------------------------------------------------------------------------
export async function PUT(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin'], async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;
      const body = await _req.json();
      const { status, priority, assigned_to } = body;

      const existingTicket = await db.supportTicket.findUnique({
        where: { id },
      });

      if (!existingTicket) {
        return NextResponse.json(
          { error: 'Ticket não encontrado' },
          { status: 404 }
        );
      }

      const updateData: Record<string, unknown> = {};

      if (status !== undefined) {
        if (!validStatuses.includes(status)) {
          return NextResponse.json(
            { error: 'Status inválido. Use: open, in_progress, resolved ou closed' },
            { status: 400 }
          );
        }
        updateData.status = status;
      }

      if (priority !== undefined) {
        if (!validPriorities.includes(priority)) {
          return NextResponse.json(
            { error: 'Prioridade inválida. Use: low, normal, high ou urgent' },
            { status: 400 }
          );
        }
        updateData.priority = priority;
      }

      if (assigned_to !== undefined) {
        // Validate assigned_to user exists and has Admin/Operator role
        if (assigned_to !== null) {
          const assignee = await db.user.findUnique({
            where: { id: assigned_to },
            select: { id: true, role: true },
          });
          if (!assignee) {
            return NextResponse.json(
              { error: 'Usuário responsável não encontrado' },
              { status: 400 }
            );
          }
          if (!['Admin', 'Operator'].includes(assignee.role)) {
            return NextResponse.json(
              { error: 'Responsável deve ser Admin ou Operador' },
              { status: 400 }
            );
          }
        }
        updateData.assigned_to = assigned_to;
      }

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json(
          { error: 'Nenhum campo para atualizar' },
          { status: 400 }
        );
      }

      const ticket = await db.supportTicket.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          protocol: true,
          subject: true,
          status: true,
          priority: true,
          user_id: true,
          assigned_to: true,
          created_at: true,
          updated_at: true,
          user: {
            select: {
              id: true,
              full_name: true,
              email: true,
            },
          },
          assignee: {
            select: {
              id: true,
              full_name: true,
              email: true,
            },
          },
        },
      });

      const changes = Object.keys(updateData)
        .map((key) => `${key}: ${updateData[key] ?? 'removido'}`)
        .join(', ');

      await logAction(
        _req.user!.userId,
        'update_support_ticket',
        `Ticket ${existingTicket.protocol} atualizado — ${changes}`,
        _req
      );

      return NextResponse.json({ ticket });
    } catch (error) {
      console.error('Update support ticket error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}
