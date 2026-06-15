import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken, hashPassword, validatePasswordStrength, comparePassword } from '@/lib/auth';
import { logAction } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Senha atual e nova senha são obrigatórias' },
        { status: 400 }
      );
    }

    // Validate new password strength
    const passwordCheck = validatePasswordStrength(newPassword);
    if (!passwordCheck.valid) {
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
