import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const student_id = searchParams.get('student_id') || '';
    const school_id = searchParams.get('school_id') || '';
    const date = searchParams.get('date') || '';
    const date_from = searchParams.get('date_from') || '';
    const date_to = searchParams.get('date_to') || '';
    const status = searchParams.get('status') || '';

    const where: Record<string, unknown> = {};

    if (student_id) where.student_id = student_id;
    if (status) where.status = status;
    if (date) {
      const dateStart = new Date(date);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(date);
      dateEnd.setHours(23, 59, 59, 999);
      where.date = { gte: dateStart, lte: dateEnd };
    } else {
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
        where.date = dateFilter;
      }
    }

    if (school_id) {
      where.student = { school_id };
    }

    // Pagination to prevent loading all records at once
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(1, rawLimit), 100);
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      db.attendanceRecord.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              full_name: true,
              class: true,
              grade: true,
              school: { select: { id: true, name: true } },
            },
          },
          user: {
            select: { id: true, full_name: true },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      db.attendanceRecord.count({ where }),
    ]);

    return NextResponse.json({
      records,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List attendance error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

export const POST = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const { student_id, date, status } = body;

    if (!student_id || !date || !status) {
      return NextResponse.json(
        { error: 'ID do aluno, data e status são obrigatórios' },
        { status: 400 }
      );
    }

    if (!['present', 'absent'].includes(status)) {
      return NextResponse.json(
        { error: 'Status inválido. Use: present ou absent' },
        { status: 400 }
      );
    }

    // Verify student exists
    const student = await db.student.findUnique({ where: { id: student_id } });
    if (!student) {
      return NextResponse.json(
        { error: 'Aluno não encontrado' },
        { status: 404 }
      );
    }

    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

    // Use upsert on student_id + date unique constraint
    const record = await db.attendanceRecord.upsert({
      where: {
        student_id_date: {
          student_id,
          date: dateObj,
        },
      },
      create: {
        student_id,
        date: dateObj,
        status,
        created_by: req.user!.userId,
      },
      update: {
        status,
        created_by: req.user!.userId,
      },
      include: {
        student: {
          select: { id: true, full_name: true },
        },
      },
    });

    return NextResponse.json({ record });
  } catch (error) {
    console.error('Create/update attendance error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
