import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { comparePassword, generateToken } from '@/lib/auth';
import { logAction } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email e senha são obrigatórios' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      );
    }

    // Check if account is locked
    if (
      user.failed_login_attempts >= 5 &&
      user.locked_until &&
      new Date(user.locked_until) > new Date()
    ) {
      return NextResponse.json(
        { error: 'Conta bloqueada. Tente novamente mais tarde.' },
        { status: 423 }
      );
    }

    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      // Increment failed login attempts
      const newAttempts = user.failed_login_attempts + 1;
      const lockUntil =
        newAttempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null; // 30 min lock

      await db.user.update({
        where: { id: user.id },
        data: {
          failed_login_attempts: newAttempts,
          locked_until: lockUntil,
        },
      });

      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      );
    }

    // Reset failed login attempts and update last login
    await db.user.update({
      where: { id: user.id },
      data: {
        failed_login_attempts: 0,
        locked_until: null,
        last_login: new Date(),
      },
    });

    // Generate JWT
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Log action
    await logAction(user.id, 'login', `Login realizado: ${user.email}`, req);

    // Return user info without password
    const { password: _, ...userWithoutPassword } = user;

    return NextResponse.json({
      token,
      user: {
        ...userWithoutPassword,
        last_login: new Date(),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
