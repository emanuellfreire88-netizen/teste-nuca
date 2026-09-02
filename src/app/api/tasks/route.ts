import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_PRIORITIES = ['baixa', 'normal', 'alta', 'critica'];
const VALID_STATUSES = ['pending', 'in_progress', 'blocked', 'completed', 'cancelled'];
const VALID_RELATED_TYPES = ['student', 'event', 'document', 'dropout', 'general'];

// GET /api/tasks — List tasks (filtered by user role)
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || '';
    const priority = searchParams.get('priority') || '';
    const assigned_to = searchParams.get('assigned_to') || '';
    const overdue = searchParams.get('overdue') === 'true';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50')), 200);
    const skip = (page - 1) * limit;

    const userId = req.user!.userId;
    const userRole = req.user!.role;

    const where: Record<string, unknown> = {};

    // Non-admins see only tasks assigned to them or created by them
    if (userRole !== 'Admin') {
      where.OR = [
        { assigned_to: userId },
        { created_by: userId },
      ];
    }

    if (status && VALID_STATUSES.includes(status)) {
      where.status = status;
    }
    if (priority && VALID_PRIORITIES.includes(priority)) {
      where.priority = priority;
    }
    if (assigned_to) {
      where.assigned_to = assigned_to;
    }

    // Overdue filter: due_date < now AND status not completed/cancelled
    if (overdue) {
      where.due_date = { lt: new Date() };
      where.status = { in: ['pending', 'in_progress', 'blocked'] };
    }

    const [tasks, total] = await Promise.all([
      db.task.findMany({
        where,
        include: {
          creator: { select: { id: true, full_name: true } },
          assignee: { select: { id: true, full_name: true } },
        },
        orderBy: [
          { priority: 'desc' },
          { due_date: 'asc' },
          { created_at: 'desc' },
        ],
        skip,
        take: limit,
      }),
      db.task.count({ where }),
    ]);

    // Count overdue tasks for summary
    const overdueCount = await db.task.count({
      where: {
        ...where,
        due_date: { lt: new Date() },
        status: { in: ['pending', 'in_progress', 'blocked'] },
      },
    });

    return NextResponse.json({
      tasks,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: {
        total,
        overdue: overdueCount,
      },
    });
  } catch (error) {
    console.error('List tasks error:', error);
    return NextResponse.json({ error: 'Erro ao listar tarefas' }, { status: 500 });
  }
});

// POST /api/tasks — Create a new task
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const { title, description, priority, due_date, assigned_to, related_type, related_id } = body;

    if (!title || typeof title !== 'string' || title.length < 1 || title.length > 255) {
      return NextResponse.json({ error: 'Título é obrigatório (1-255 caracteres)' }, { status: 400 });
    }

    if (description && typeof description === 'string' && description.length > 2000) {
      return NextResponse.json({ error: 'Descrição muito longa (máx 2000 caracteres)' }, { status: 400 });
    }

    const taskPriority = priority || 'normal';
    if (!VALID_PRIORITIES.includes(taskPriority)) {
      return NextResponse.json({ error: 'Prioridade inválida' }, { status: 400 });
    }

    if (related_type && !VALID_RELATED_TYPES.includes(related_type)) {
      return NextResponse.json({ error: 'Tipo de relacionamento inválido' }, { status: 400 });
    }

    // Validate due_date if provided
    let taskDueDate: Date | null = null;
    if (due_date) {
      taskDueDate = new Date(due_date);
      if (isNaN(taskDueDate.getTime())) {
        return NextResponse.json({ error: 'Data de prazo inválida' }, { status: 400 });
      }
    }

    // Validate assigned_to if provided
    if (assigned_to) {
      const user = await db.user.findUnique({ where: { id: assigned_to } });
      if (!user) {
        return NextResponse.json({ error: 'Usuário atribuído não encontrado' }, { status: 404 });
      }
    }

    const task = await db.task.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        priority: taskPriority,
        status: 'pending',
        due_date: taskDueDate,
        assigned_to: assigned_to || null,
        related_type: related_type || null,
        related_id: related_id || null,
        created_by: req.user!.userId,
      },
      include: {
        creator: { select: { id: true, full_name: true } },
        assignee: { select: { id: true, full_name: true } },
      },
    });

    await logAction(req.user!.userId, 'create_task', `Tarefa criada: ${title}`, req);

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('Create task error:', error);
    return NextResponse.json({ error: 'Erro ao criar tarefa' }, { status: 500 });
  }
});
