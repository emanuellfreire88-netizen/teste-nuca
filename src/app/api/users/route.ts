import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

const validRoles = ['Admin', 'Operator', 'Viewer'];

export const GET = withRole(['Admin'], async (req: AuthenticatedRequest) => {
  try {
    const users = await db.user.findMany({
      select: {
        id: true,
        full_name: true,
        email: true,
        role: true,
        status: true,
        profile_photo: true,
        two_factor_enabled: true,
        failed_login_attempts: true,
        locked_until: true,
        last_login: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return NextResponse.json({ users });
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
    const { full_name, email, password, role, status, profile_photo } = body;

    if (!full_name || !email || !password) {
      return NextResponse.json(
        { error: 'Nome, email e senha são obrigatórios' },
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

    const user = await db.user.create({
      data: {
        full_name,
        email,
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
        created_at: true,
        updated_at: true,
      },
    });

    await logAction(req.user!.userId, 'create_user', `Usuário criado: ${email}`, req);

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
