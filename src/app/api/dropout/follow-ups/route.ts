import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds, canUserAccessSchool } from '@/lib/user-schools';

// ---------------------------------------------------------------------------
// GET /api/dropout/follow-ups — List follow-up actions
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('student_id') || '';
    const actionType = searchParams.get('action_type') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const rawLimit = parseInt(searchParams.get('limit') || '10');
    const limit = Math.min(Math.max(1, rawLimit), 100);
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (studentId) {
      where.student_id = studentId;
    }

    if (actionType) {
      where.action_type = actionType;
    }

    // School scoping: if no specific student_id filter, we need to ensure
    // the user can only see follow-ups for students in their schools
    if (!studentId) {
      const allowedSchoolIds = await getUserSchoolIds(
        req.user!.userId,
        req.user!.role
      );

      if (allowedSchoolIds !== null) {
        where.student = {
          school_id: { in: allowedSchoolIds },
        };
      }
    } else {
      // Verify access to this student's school
      const student = await db.student.findUnique({
        where: { id: studentId },
        select: { school_id: true },
      });

      if (student) {
        const canAccess = await canUserAccessSchool(
          req.user!.userId,
          req.user!.role,
          student.school_id
        );
        if (!canAccess) {
          return NextResponse.json(
            { error: 'Aluno não encontrado' },
            { status: 404 }
          );
        }
      }
    }

    const [followUps, total] = await Promise.all([
      db.dropoutFollowUp.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              full_name: true,
              photo: true,
              school: { select: { id: true, name: true } },
            },
          },
          responsible: {
            select: { id: true, full_name: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      db.dropoutFollowUp.count({ where }),
    ]);

    return NextResponse.json({
      follow_ups: followUps,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List follow-ups error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/dropout/follow-ups — Create a new follow-up action
// ---------------------------------------------------------------------------
export const POST = withRole(
  ['Admin', 'Operator'],
  async (req: AuthenticatedRequest) => {
    try {
      const body = await req.json();
      const { student_id, action_type, description, notes } = body;

      // Validate required fields
      if (!student_id) {
        return NextResponse.json(
          { error: 'ID do aluno é obrigatório' },
          { status: 400 }
        );
      }

      if (!action_type) {
        return NextResponse.json(
          { error: 'Tipo de ação é obrigatório' },
          { status: 400 }
        );
      }

      const validActionTypes = [
        'call',
        'contact_guardian',
        'home_visit',
        'conversation',
        'returned',
      ];
      if (!validActionTypes.includes(action_type)) {
        return NextResponse.json(
          {
            error: `Tipo de ação inválido. Valores permitidos: ${validActionTypes.join(', ')}`,
          },
          { status: 400 }
        );
      }

      // Verify student exists
      const student = await db.student.findUnique({
        where: { id: student_id },
        select: { id: true, full_name: true, school_id: true },
      });

      if (!student) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      // Verify user has access to student's school
      const canAccess = await canUserAccessSchool(
        req.user!.userId,
        req.user!.role,
        student.school_id
      );
      if (!canAccess) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      // Create follow-up
      const followUp = await db.dropoutFollowUp.create({
        data: {
          student_id,
          action_type,
          description: description || null,
          responsible_id: req.user!.userId,
          notes: notes || null,
        },
      });

      // Fetch with relations for response
      const result = await db.dropoutFollowUp.findUnique({
        where: { id: followUp.id },
        include: {
          student: {
            select: {
              id: true,
              full_name: true,
              photo: true,
              school: { select: { id: true, name: true } },
            },
          },
          responsible: {
            select: { id: true, full_name: true },
          },
        },
      });

      return NextResponse.json({ follow_up: result }, { status: 201 });
    } catch (error) {
      console.error('Create follow-up error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  }
);
