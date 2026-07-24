import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { sanitizeInput } from '@/lib/auth';
import { logAction } from '@/lib/logger';
import { ciContains } from '@/lib/search';
import { getUserSchoolIds } from '@/lib/user-schools';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const rawLimit = parseInt(searchParams.get('limit') || '10');
    const limit = Math.min(Math.max(1, rawLimit), 500); // Cap at 500 to allow bulk fetches
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const school_id = searchParams.get('school_id') || '';
    const grade = searchParams.get('grade') || '';
    const classFilter = searchParams.get('class') || '';

    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { full_name: ciContains(search) },
        { cpf: ciContains(search) },
        { rg: ciContains(search) },
      ];
    }

    if (status) where.status = status;
    if (grade) where.grade = grade;
    if (classFilter) where.class = classFilter;

    // ── School scoping ──
    // Non-admins are restricted to their assigned schools. If they request a
    // specific school_id, we also verify it is within their allowed set.
    const allowedSchoolIds = await getUserSchoolIds(req.user!.userId, req.user!.role);

    if (allowedSchoolIds !== null) {
      // Non-admin
      if (school_id) {
        // Requested school must be within the allowed set
        if (!allowedSchoolIds.includes(school_id)) {
          return NextResponse.json({
            students: [],
            pagination: { page, limit, total: 0, totalPages: 0 },
          });
        }
        where.school_id = school_id;
      } else {
        where.school_id = { in: allowedSchoolIds };
      }
    } else if (school_id) {
      // Admin explicitly filtering by school
      where.school_id = school_id;
    }

    const [students, total] = await Promise.all([
      db.student.findMany({
        where,
        include: {
          school: {
            select: { id: true, name: true },
          },
        },
        orderBy: [
          { full_name: 'asc' },
        ],
        skip,
        take: limit,
      }),
      db.student.count({ where }),
    ]);

    return NextResponse.json({
      students,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List students error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

export const POST = withRole(['Admin'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const {
      full_name,
      cpf,
      rg,
      date_of_birth,
      blood_type,
      special_needs,
      medications,
      class: studentClass,
      grade,
      phone,
      address,
      guardian_name,
      guardian_phone,
      guardian_email,
      emergency_contact,
      school_id,
      status,
      image_authorization,
      participation_authorization,
      photo,
    } = body;

    if (!full_name || !school_id) {
      return NextResponse.json(
        { error: 'Nome e escola são obrigatórios' },
        { status: 400 }
      );
    }

    // Validate field lengths
    if (full_name.length > 255) {
      return NextResponse.json(
        { error: 'Nome deve ter no máximo 255 caracteres' },
        { status: 400 }
      );
    }

    // Validate CPF format if provided (XXX.XXX.XXX-XX or just digits)
    if (cpf) {
      const cpfClean = cpf.replace(/[^0-9]/g, '');
      if (cpfClean.length !== 11) {
        return NextResponse.json(
          { error: 'CPF deve conter 11 dígitos' },
          { status: 400 }
        );
      }
    }

    // Verify school exists
    const school = await db.school.findUnique({ where: { id: school_id } });
    if (!school) {
      return NextResponse.json(
        { error: 'Escola não encontrada' },
        { status: 404 }
      );
    }

    // Check CPF uniqueness if provided
    if (cpf) {
      const existingCpf = await db.student.findUnique({ where: { cpf } });
      if (existingCpf) {
        return NextResponse.json(
          { error: 'CPF já cadastrado' },
          { status: 409 }
        );
      }
    }

    // NOTE: Neon HTTP adapter does not support transactions. Prisma's
    // `create` with `include` triggers an implicit transaction, so we split
    // into a plain CREATE + a separate findUnique to fetch relations.
    const created = await db.student.create({
      data: {
        full_name: sanitizeInput(full_name),
        cpf: cpf ? sanitizeInput(cpf) : null,
        rg: rg ? sanitizeInput(rg) : null,
        date_of_birth: date_of_birth ? new Date(date_of_birth) : null,
        blood_type: blood_type ? sanitizeInput(blood_type) : null,
        special_needs: special_needs ? sanitizeInput(special_needs) : null,
        medications: medications ? sanitizeInput(medications) : null,
        class: studentClass ? sanitizeInput(studentClass) : null,
        grade: grade ? sanitizeInput(grade) : null,
        phone: phone ? sanitizeInput(phone) : null,
        address: address ? sanitizeInput(address) : null,
        guardian_name: guardian_name ? sanitizeInput(guardian_name) : null,
        guardian_phone: guardian_phone ? sanitizeInput(guardian_phone) : null,
        guardian_email: guardian_email ? sanitizeInput(guardian_email) : null,
        emergency_contact: emergency_contact ? sanitizeInput(emergency_contact) : null,
        school_id,
        status: status || 'active',
        image_authorization: image_authorization && ['authorized', 'not_authorized', 'pending'].includes(image_authorization) ? image_authorization : 'pending',
        participation_authorization: participation_authorization && ['authorized', 'not_authorized', 'pending'].includes(participation_authorization) ? participation_authorization : 'pending',
        photo: photo || null,
      },
    });

    const student = await db.student.findUnique({
      where: { id: created.id },
      include: {
        school: {
          select: { id: true, name: true },
        },
      },
    });

    await logAction(req.user!.userId, 'create_student', `Aluno criado: ${full_name}`, req);

    return NextResponse.json({ student }, { status: 201 });
  } catch (error) {
    console.error('Create student error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
