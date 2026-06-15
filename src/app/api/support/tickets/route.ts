import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Protocol number generator: SUP-YYYY-NNNN
// ---------------------------------------------------------------------------
async function generateProtocol(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.supportTicket.count({
    where: {
      created_at: {
        gte: new Date(`${year}-01-01T00:00:00.000Z`),
      },
    },
  });
  const sequence = (count + 1).toString().padStart(4, '0');
  return `SUP-${year}-${sequence}`;
}

// ---------------------------------------------------------------------------
// GET /api/support/tickets — List tickets
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const rawLimit = parseInt(searchParams.get('limit') || '10');
    const limit = Math.min(Math.max(1, rawLimit), 100);
    const status = searchParams.get('status') || '';
    const search = searchParams.get('search') || '';

    const skip = (page - 1) * limit;
    const user = req.user!;
    const isAdminOrOperator = user.role === 'Admin' || user.role === 'Operator';

    const where: Record<string, unknown> = {};

    // Non-admin users can only see their own tickets
    if (!isAdminOrOperator) {
      where.user_id = user.userId;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { subject: { contains: search } },
        { protocol: { contains: search } },
      ];
    }

    const [tickets, total] = await Promise.all([
      db.supportTicket.findMany({
        where,
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
              profile_photo: true,
            },
          },
          assignee: {
            select: {
              id: true,
              full_name: true,
              email: true,
            },
          },
          _count: {
            select: { messages: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      db.supportTicket.count({ where }),
    ]);

    // Flatten _count into message_count
    const formattedTickets = tickets.map(({ _count, ...ticket }) => ({
      ...ticket,
      message_count: _count.messages,
    }));

    return NextResponse.json({
      tickets: formattedTickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List support tickets error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/support/tickets — Create a new ticket
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const { subject, content, priority } = body;

    if (!subject || !content) {
      return NextResponse.json(
        { error: 'Assunto e conteúdo são obrigatórios' },
        { status: 400 }
      );
    }

    if (subject.length > 255) {
      return NextResponse.json(
        { error: 'Assunto deve ter no máximo 255 caracteres' },
        { status: 400 }
      );
    }

    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    const ticketPriority = validPriorities.includes(priority) ? priority : 'normal';

    const protocol = await generateProtocol();

    const ticket = await db.supportTicket.create({
      data: {
        protocol,
        subject,
        status: 'open',
        priority: ticketPriority,
        user_id: req.user!.userId,
        messages: {
          create: {
            sender_id: req.user!.userId,
            content,
          },
        },
      },
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
            profile_photo: true,
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
                profile_photo: true,
                role: true,
              },
            },
          },
          orderBy: { created_at: 'asc' },
        },
      },
    });

    await logAction(
      req.user!.userId,
      'create_support_ticket',
      `Ticket criado: ${protocol} - ${subject}`,
      req
    );

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    console.error('Create support ticket error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
