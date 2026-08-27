import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken, hashPassword, validatePasswordStrength, comparePassword } from '@/lib/auth';
import { isTokenRevoked } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

// In-memory rate limiter for password change attempts (max 5 per 15 min per user)
const pwdChangeAttempts = new Map<string, { count: number; lastAttempt: number }>();
const PWD_RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const PWD_MAX_ATTEMPTS = 5;

function isPwdRateLimited(userId: string): boolean {
  const entry = pwdChangeAttempts.get(userId);
  if (!entry) return false;
  if (Date.now() - entry.lastAttempt > PWD_RATE_LIMIT_WINDOW) {
    pwdChangeAttempts.delete(userId);
    return false;
  }
  return entry.count >= PWD_MAX_ATTEMPTS;
}

function recordPwdAttempt(userId: string): void {
  const entry = pwdChangeAttempts.get(userId);
  if (!entry || Date.now() - entry.lastAttempt > PWD_RATE_LIMIT_WINDOW) {
    pwdChangeAttempts.set(userId, { count: 1, lastAttempt: Date.now() });
  } else {
    entry.count++;
    entry.lastAttempt = Date.now();
  }
}

function clearPwdAttempts(userId: string): void {
  pwdChangeAttempts.delete(userId);
}

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    
    // Check if token has been revoked (e.g. after logout)
    if (isTokenRevoked(token)) {
      return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 401 });
    }
    
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Rate limit password change attempts
    if (isPwdRateLimited(payload.userId)) {
      return NextResponse.json(
        { error: 'Muitas tentativas de alteração de senha. Tente novamente em 15 minutos.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      recordPwdAttempt(payload.userId);
      return NextResponse.json(
        { error: 'Senha atual e nova senha são obrigatórias' },
        { status: 400 }
      );
    }

    // Validate new password strength
    const passwordCheck = validatePasswordStrength(newPassword);
    if (!passwordCheck.valid) {
      recordPwdAttempt(payload.userId);
      return NextResponse.json(
        { error: `Senha fraca. Requisitos: ${passwordCheck.errors.join(', ')}` },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Verify current password
    const isPasswordValid = await comparePassword(currentPassword, user.password);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Senha atual incorreta' },
        { status: 401 }
      );
    }

    // Check new password is different from current
    const isSamePassword = await comparePassword(newPassword, user.password);
    if (isSamePassword) {
      return NextResponse.json(
        { error: 'A nova senha deve ser diferente da senha atual' },
        { status: 400 }
      );
    }

    // Hash and update password
    const hashedPassword = await hashPassword(newPassword);

    await db.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        must_change_password: false,
      },
    });

    // Clear rate limit attempts on successful password change
    clearPwdAttempts(user.id);

    await logAction(
      user.id,
      'password_changed',
      `Senha alterada pelo usuário: ${user.email}`,
      req
    );

    return NextResponse.json({
      message: 'Senha alterada com sucesso!',
      must_change_password: false,
    });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
