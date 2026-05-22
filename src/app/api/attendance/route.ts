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

    // Batch request: body.records is an array of { student_id, date, status }
    if (Array.isArray(body.records)) {
      return await handleBatchAttendance(body.records, req.user!.userId);
    }

    // Single record request (backward compatible)
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

async function handleBatchAttendance(
  records: { student_id: string; date: string; status: string }[],
  userId: string
) {
  if (records.length === 0) {
    return NextResponse.json(
      { error: 'Array de registros não pode estar vazio' },
      { status: 400 }
    );
  }

  if (records.length > 500) {
    return NextResponse.json(
      { error: 'Máximo de 500 registros por requisição batch' },
      { status: 400 }
    );
  }

  // Validate all records before processing
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (!rec.student_id || !rec.date || !rec.status) {
      return NextResponse.json(
        { error: `Registro ${i}: student_id, date e status são obrigatórios` },
        { status: 400 }
      );
    }
    if (!['present', 'absent'].includes(rec.status)) {
      return NextResponse.json(
        { error: `Registro ${i}: status inválido. Use: present ou absent` },
        { status: 400 }
      );
    }
  }

  // Verify all students exist in a single query
  const studentIds = [...new Set(records.map((r) => r.student_id))];
  const existingStudents = await db.student.findMany({
    where: { id: { in: studentIds } },
    select: { id: true },
  });
  const existingIds = new Set(existingStudents.map((s) => s.id));

  for (const rec of records) {
    if (!existingIds.has(rec.student_id)) {
      return NextResponse.json(
        { error: `Aluno não encontrado: ${rec.student_id}` },
        { status: 404 }
      );
    }
  }

  // Use transaction to upsert all records
  const result = await db.$transaction(
    records.map((rec) => {
      const dateObj = new Date(rec.date);
      dateObj.setHours(0, 0, 0, 0);

      return db.attendanceRecord.upsert({
        where: {
          student_id_date: {
            student_id: rec.student_id,
            date: dateObj,
          },
        },
        create: {
          student_id: rec.student_id,
          date: dateObj,
          status: rec.status,
          created_by: userId,
        },
        update: {
          status: rec.status,
          created_by: userId,
        },
      });
    })
  );

  // Calculate summary: created vs updated
  // For upsert, we rely on Prisma's return value — newly created records have
  // created_at matching the transaction timestamp while updated ones differ.
  // Since AttendanceRecord doesn't have an updated_at field, we count all as "upserted".
  const total = result.length;

  return NextResponse.json({
    total,
  });
}
