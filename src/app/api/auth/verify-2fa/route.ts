import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateToken } from '@/lib/auth';
import { logAction } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, code } = body;

    if (!userId || !code) {
      return NextResponse.json(
        { error: 'Usuário e código são obrigatórios' },
        { status: 400 }
      );
    }

    // Validate code format (6 digits)
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: 'Código inválido. Digite os 6 dígitos.' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { id: userId } });

    if (!user) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    // Check if user has a verification code
    if (!user.two_factor_secret || !user.locked_until) {
      return NextResponse.json(
        { error: 'Nenhum código de verificação pendente. Faça login novamente.' },
        { status: 400 }
      );
    }

    // Check if code is expired
    if (new Date(user.locked_until) < new Date()) {
      // Clear the expired code
      await db.user.update({
        where: { id: user.id },
        data: {
          two_factor_secret: null,
          locked_until: null,
        },
      });
      return NextResponse.json(
        { error: 'Código expirado. Faça login novamente para receber um novo código.' },
        { status: 400 }
      );
    }

    // Check if code matches
    if (user.two_factor_secret !== code) {
      return NextResponse.json(
        { error: 'Código incorreto. Tente novamente.' },
        { status: 401 }
      );
    }

    // Code is valid — clear it and complete login
    await db.user.update({
      where: { id: user.id },
      data: {
        two_factor_secret: null,
        locked_until: null,
        failed_login_attempts: 0,
        last_login: new Date(),
      },
    });

    // Generate JWT
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Log successful login
    await logAction(user.id, 'login', `Login com 2FA realizado: ${user.email}`, req);

    // Return user info without sensitive fields
    const { password: _, two_factor_secret: __, ...userWithoutSensitive } = user;

    return NextResponse.json({
      token,
      user: {
        ...userWithoutSensitive,
        last_login: new Date(),
      },
    });
  } catch (error) {
    console.error('2FA verification error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
