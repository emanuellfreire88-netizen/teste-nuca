import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';

export const GET = withRole(['Admin'], async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get('user_id') || '';
    const action_type = searchParams.get('action_type') || '';
    const date_from = searchParams.get('date_from') || '';
    const date_to = searchParams.get('date_to') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const rawLimit = parseInt(searchParams.get('limit') || '20');
    const limit = Math.min(Math.max(1, rawLimit), 100); // Cap at 100 to prevent DoS

    const where: Record<string, unknown> = {};

    if (user_id) where.user_id = user_id;
    if (action_type) where.action_type = action_type;

    const dateFilter: Record<string, Date> = {};
    if (date_from) {
      const from = new Date(date_from);
      from.setHours(0, 0, 0, 0);
      dateFilter.gte = from;
    }
    if (date_to) {
      const to = new Date(date_to);
      to.setHours(23, 59, 59, 999);
      dateFilter.lte = to;
    }
    if (Object.keys(dateFilter).length > 0) {
      where.created_at = dateFilter;
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      db.actionLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, full_name: true, email: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      db.actionLog.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List action logs error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
