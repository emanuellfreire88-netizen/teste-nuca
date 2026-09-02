import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_STATUSES = ['pending', 'in_progress', 'blocked', 'completed', 'cancelled'];
const VALID_PRIORITIES = ['baixa', 'normal', 'alta', 'critica'];

// PUT /api/tasks/[id] — Update a task
export const PUT = withAuth(async (req: AuthenticatedRequest, context?: { params: Promise<Record<string, string>> }) => {
  try {
    if (!context?.params) return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    const { id } = await context.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });
    }

    // Permission: only admin, creator, or assignee can update
    if (userRole !== 'Admin' && existing.created_by !== userId && existing.assigned_to !== userId) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const body = await req.json();
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.length < 1 || body.title.length > 255) {
        return NextResponse.json({ error: 'Título inválido' }, { status: 400 });
      }
      updateData.title = body.title.trim();
    }

    if (body.description !== undefined) {
      updateData.description = typeof body.description === 'string' ? body.description.trim() : null;
    }

    if (body.priority !== undefined) {
      if (!VALID_PRIORITIES.includes(body.priority)) {
        return NextResponse.json({ error: 'Prioridade inválida' }, { status: 400 });
      }
      updateData.priority = body.priority;
    }

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
      }
      updateData.status = body.status;

      // If completing, set completed_at
      if (body.status === 'completed') {
        updateData.completed_at = new Date();
      } else {
        updateData.completed_at = null;
      }
    }

    if (body.due_date !== undefined) {
      updateData.due_date = body.due_date ? new Date(body.due_date) : null;
    }

    if (body.assigned_to !== undefined) {
      if (body.assigned_to) {
        const user = await db.user.findUnique({ where: { id: body.assigned_to } });
        if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
      }
      updateData.assigned_to = body.assigned_to || null;
    }

    const oldStatus = existing.status;
    const newStatus = body.status;

    const task = await db.task.update({
      where: { id },
      data: updateData,
      include: {
        creator: { select: { id: true, full_name: true } },
        assignee: { select: { id: true, full_name: true } },
      },
    });

    if (newStatus && newStatus !== oldStatus) {
      await logAction(userId, 'update_task', `Tarefa "${existing.title}" — ${oldStatus} → ${newStatus}`, req);
    } else {
      await logAction(userId, 'update_task', `Tarefa atualizada: ${existing.title}`, req);
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Update task error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar tarefa' }, { status: 500 });
  }
});

// DELETE /api/tasks/[id] — Delete a task (admin or creator only)
export const DELETE = withAuth(async (req: AuthenticatedRequest, context?: { params: Promise<Record<string, string>> }) => {
  try {
    if (!context?.params) return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    const { id } = await context.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });
    }

    // Only admin or creator can delete
    if (userRole !== 'Admin' && existing.created_by !== userId) {
      return NextResponse.json({ error: 'Sem permissão para excluir' }, { status: 403 });
    }

    await db.task.delete({ where: { id } });
    await logAction(userId, 'delete_task', `Tarefa excluída: ${existing.title}`, req);

    return NextResponse.json({ message: 'Tarefa excluída' });
  } catch (error) {
    console.error('Delete task error:', error);
    return NextResponse.json({ error: 'Erro ao excluir tarefa' }, { status: 500 });
  }
});
