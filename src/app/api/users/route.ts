import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, validatePasswordStrength, sanitizeInput } from '@/lib/auth';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { ciContains } from '@/lib/search';

const validRoles = ['Admin', 'Operator', 'Viewer'];

export const GET = withRole(['Admin'], async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const rawLimit = parseInt(searchParams.get('limit') || '10');
    const limit = Math.min(Math.max(1, rawLimit), 100); // Cap at 100
    const search = searchParams.get('search') || '';

    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { full_name: ciContains(search) },
        { email: ciContains(search) },
      ];
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          full_name: true,
          email: true,
          role: true,
          status: true,
          profile_photo: true,
          two_factor_enabled: true,
          must_change_password: true,
          last_login: true,
          created_at: true,
          updated_at: true,
          user_schools: { select: { school_id: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      db.user.count({ where }),
    ]);

    // Flatten user_schools → school_ids for convenience on the client
    const usersWithSchools = users.map((u) => ({
      ...u,
      school_ids: u.user_schools.map((us) => us.school_id),
      user_schools: undefined,
    }));

    return NextResponse.json({
      users: usersWithSchools,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List users error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

export const POST = withRole(['Admin'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const { full_name, email, password, role, status, profile_photo, school_ids } = body;

    if (!full_name || !email || !password) {
      return NextResponse.json(
        { error: 'Nome, email e senha são obrigatórios' },
        { status: 400 }
      );
    }

    // Validate field lengths
    if (full_name.length > 255 || email.length > 255) {
      return NextResponse.json(
        { error: 'Nome e email devem ter no máximo 255 caracteres' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Formato de email inválido' },
        { status: 400 }
      );
    }

    // Validate password strength
    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { error: `Senha fraca. Requisitos: ${passwordCheck.errors.join(', ')}` },
        { status: 400 }
      );
    }

    if (!validRoles.includes(role || 'Viewer')) {
      return NextResponse.json(
        { error: 'Papel inválido. Use: Admin, Operator ou Viewer' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: 'Email já cadastrado' },
        { status: 409 }
      );
    }

    const hashedPassword = await hashPassword(password);

    // Validate school_ids (only relevant for non-admin roles, but we accept it always)
    const validSchoolIds: string[] = Array.isArray(school_ids)
      ? school_ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : [];

    // If school_ids were provided, verify they all exist
    if (validSchoolIds.length > 0) {
      const existingSchools = await db.school.findMany({
        where: { id: { in: validSchoolIds } },
        select: { id: true },
      });
      if (existingSchools.length !== validSchoolIds.length) {
        return NextResponse.json(
          { error: 'Uma ou mais escolas selecionadas não existem' },
          { status: 400 }
        );
      }
    }

    // NOTE: Neon HTTP adapter does not support transactions, so we cannot use
    // Prisma's nested writes (user.create with user_schools.create). Create
    // the user first, then link the schools in a separate call.
    const user = await db.user.create({
      data: {
        full_name: sanitizeInput(full_name),
        email: sanitizeInput(email),
        password: hashedPassword,
        role: role || 'Viewer',
        status: status || 'active',
        profile_photo: profile_photo || null,
      },
      select: {
        id: true,
        full_name: true,
        email: true,
        role: true,
        status: true,
        profile_photo: true,
        two_factor_enabled: true,
        must_change_password: true,
        created_at: true,
        updated_at: true,
      },
    });

    // Link the operator/viewer to their allowed schools. The Neon HTTP
    // adapter does not support createMany or transactions, so we insert
    // each link individually.
    for (const sid of validSchoolIds) {
      await db.userSchool.create({
        data: { user_id: user.id, school_id: sid },
      });
    }

    await logAction(req.user!.userId, 'create_user', `Usuário criado: ${email}`, req);

    return NextResponse.json({
      user: {
        ...user,
        school_ids: validSchoolIds,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
