import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';

const VALID_TYPES = ['dropout_alert', 'long_absence', 'low_attendance', 'offline_sync', 'info'];

/**
 * GET /api/notifications
 *
 * List notifications for the current user.
 * Query params: read (optional boolean filter), type (optional), page, limit
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const readParam = searchParams.get('read');
    const type = searchParams.get('type') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const rawLimit = parseInt(searchParams.get('limit') || '20');
    const limit = Math.min(Math.max(1, rawLimit), 100);
    const skip = (page - 1) * limit;

    const userId = req.user!.userId;

    const where: Record<string, unknown> = {
      user_id: userId,
    };

    // Filter by read status
    if (readParam !== null && readParam !== '') {
      where.read = readParam === 'true';
    }

    // Filter by notification type
    if (type) {
      if (!VALID_TYPES.includes(type)) {
        return NextResponse.json(
          { error: `Tipo inválido. Valores permitidos: ${VALID_TYPES.join(', ')}` },
          { status: 400 }
        );
      }
      where.type = type;
    }

    const [notifications, total] = await Promise.all([
      db.notification.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              full_name: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      db.notification.count({ where }),
    ]);

    // Count unread for convenience
    const unreadCount = await db.notification.count({
      where: {
        user_id: userId,
        read: false,
      },
    });

    return NextResponse.json({
      notifications,
      unread_count: unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List notifications error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/notifications
 *
 * Mark notifications as read.
 * Body: { ids: [string] } or { mark_all: true }
 */
export const PUT = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const { ids, mark_all } = body as {
      ids?: string[];
      mark_all?: boolean;
    };

    const userId = req.user!.userId;

    if (mark_all) {
      // Mark all notifications as read for this user
      const result = await db.notification.updateMany({
        where: {
          user_id: userId,
          read: false,
        },
        data: {
          read: true,
        },
      });

      return NextResponse.json({
        marked: result.count,
        message: `${result.count} notificações marcadas como lidas`,
      });
    }

    if (Array.isArray(ids) && ids.length > 0) {
      // Mark specific notifications as read
      // Only update notifications that belong to the current user
      const result = await db.notification.updateMany({
        where: {
          id: { in: ids },
          user_id: userId,
        },
        data: {
          read: true,
        },
      });

      return NextResponse.json({
        marked: result.count,
        message: `${result.count} notificações marcadas como lidas`,
      });
    }

    return NextResponse.json(
      { error: 'Forneça ids ou mark_all: true' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Mark notifications error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/notifications
 *
 * Create a notification. Admin only.
 * Body: { user_id, type, title, message, related_student_id? }
 */
export const POST = withRole(['Admin'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const { user_id, type, title, message, related_student_id } = body as {
      user_id?: string;
      type?: string;
      title?: string;
      message?: string;
      related_student_id?: string;
    };

    if (!user_id || !type || !title || !message) {
      return NextResponse.json(
        { error: 'user_id, type, title e message são obrigatórios' },
        { status: 400 }
      );
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Tipo inválido. Valores permitidos: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify target user exists
    const targetUser = await db.user.findUnique({
      where: { id: user_id },
      select: { id: true },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    // Verify related student exists (if provided)
    if (related_student_id) {
      const student = await db.student.findUnique({
        where: { id: related_student_id },
        select: { id: true },
      });

      if (!student) {
        return NextResponse.json(
          { error: 'Aluno relacionado não encontrado' },
          { status: 404 }
        );
      }
    }

    const notification = await db.notification.create({
      data: {
        user_id,
        type,
        title,
        message,
        related_student_id: related_student_id || null,
      },
    });

    return NextResponse.json({ notification }, { status: 201 });
  } catch (error) {
    console.error('Create notification error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
