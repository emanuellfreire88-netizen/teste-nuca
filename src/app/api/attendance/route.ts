import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds, canUserAccessSchool } from '@/lib/user-schools';

/**
 * Create a consistent UTC midnight Date from a date string like "2026-06-12".
 * Avoids timezone-dependent setHours() which can cause mismatches
 * between the upsert's `where` and `create` values on servers with
 * different local timezones (e.g. Vercel runs in UTC).
 */
function toUTCDate(dateStr: string): Date {
  // Parse "YYYY-MM-DD" → UTC midnight
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

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
      const dateStart = toUTCDate(date);
      const dateEnd = new Date(dateStart);
      dateEnd.setUTCHours(23, 59, 59, 999);
      where.date = { gte: dateStart, lte: dateEnd };
    } else {
      const dateFilter: Record<string, Date> = {};
      if (date_from) {
        dateFilter.gte = toUTCDate(date_from);
      }
      if (date_to) {
        const end = toUTCDate(date_to);
        end.setUTCHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      if (Object.keys(dateFilter).length > 0) {
        where.date = dateFilter;
      }
    }

    if (school_id) {
      where.student = { school_id };
    }

    // ── Scope attendance to the operator's assigned schools ──
    // Non-admins can only see attendance for students in their schools.
    const allowedSchoolIds = await getUserSchoolIds(req.user!.userId, req.user!.role);
    if (allowedSchoolIds !== null) {
      // Non-admin
      if (allowedSchoolIds.length === 0) {
        // No schools assigned → no records
        return NextResponse.json({
          records: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        });
      }
      // If a specific school_id was requested, ensure it's within allowed set
      if (school_id && !allowedSchoolIds.includes(school_id)) {
        return NextResponse.json({
          records: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        });
      }
      // Combine with any existing student filter
      where.student = {
        ...(where.student as Record<string, unknown> | undefined),
        school_id: { in: allowedSchoolIds },
      };
    }

    // Pagination to prevent loading all records at once
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(1, rawLimit), 200);
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
      return await handleBatchAttendance(body.records, req.user!.userId, req.user!.role);
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

    // Non-admins can only mark attendance for students in their assigned schools
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

    const dateObj = toUTCDate(date);

    // Use upsert on student_id + date unique constraint.
    // NOTE: Neon HTTP adapter does not support `include` on upsert (triggers
    // a transaction). Return the bare record; callers that need the student
    // info already have the student_id.
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
  userId: string,
  userRole: string
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
    select: { id: true, school_id: true },
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

  // ── School access check for non-admins ──
  // Operators can only mark attendance for students in their assigned schools.
  const allowedSchoolIds = await getUserSchoolIds(userId, userRole);
  if (allowedSchoolIds !== null) {
    const allowedSet = new Set(allowedSchoolIds);
    const offLimits = existingStudents.find(
      (s) => !allowedSet.has(s.school_id)
    );
    if (offLimits) {
      return NextResponse.json(
        { error: 'Você não tem permissão para registrar frequência de alunos de todas as escolas informadas.' },
        { status: 403 }
      );
    }
  }

  try {
    // Use transaction to upsert all records
    // Process in chunks of 50 to avoid Neon statement timeout
    const CHUNK_SIZE = 50;
    let totalUpserted = 0;

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);

      // NOTE: Neon HTTP adapter does not support $transaction. Process
      // upserts sequentially in chunks (still chunked to avoid timeouts).
      const result = [];
      for (const rec of chunk) {
        const dateObj = toUTCDate(rec.date);
        const upserted = await db.attendanceRecord.upsert({
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
        result.push(upserted);
      }

      totalUpserted += result.length;
    }

    return NextResponse.json({
      total: totalUpserted,
    });
  } catch (error: unknown) {
    console.error('Batch attendance transaction error:', error);

    // Provide more specific error messages for common Prisma errors
    const errMsg = error instanceof Error ? error.message : '';
    if (errMsg.includes('UniqueConstraint')) {
      return NextResponse.json(
        { error: 'Conflito de registro: já existe uma frequência para este aluno nesta data.' },
        { status: 409 }
      );
    }
    if (errMsg.includes('timeout') || errMsg.includes('Timed out')) {
      return NextResponse.json(
        { error: 'Tempo esgotado ao salvar frequência. Tente com menos alunos ou tente novamente.' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: 'Erro ao salvar frequência. Tente novamente.' },
      { status: 500 }
    );
  }
}
