import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { canUserAccessSchool } from '@/lib/user-schools';

export async function GET(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;

      // Verify student exists
      const student = await db.student.findUnique({ where: { id } });
      if (!student) {
        return NextResponse.json(
          { error: 'Não encontrado' },
          { status: 404 }
        );
      }

      // VULN-5 FIX: verify the caller has access to the student's school
      // before exposing the student's event participation history.
      const canAccess = await canUserAccessSchool(
        _req.user!.userId,
        _req.user!.role,
        student.school_id
      );
      if (!canAccess) {
        return NextResponse.json(
          { error: 'Não encontrado' },
          { status: 404 }
        );
      }

      const { searchParams } = new URL(_req.url);
      const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
      const rawLimit = parseInt(searchParams.get('limit') || '10');
      const limit = Math.min(Math.max(1, rawLimit), 100);
      const status = searchParams.get('status') || '';

      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = {
        student_id: id,
      };

      if (status) where.event = { status };

      const [participations, total] = await Promise.all([
        db.eventParticipant.findMany({
          where,
          include: {
            event: {
              select: {
                id: true,
                title: true,
                date: true,
                status: true,
                location: true,
              },
            },
          },
          orderBy: { event: { date: 'desc' } },
          skip,
          take: limit,
        }),
        db.eventParticipant.count({ where }),
      ]);

      return NextResponse.json({
        participations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('List student events error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}
