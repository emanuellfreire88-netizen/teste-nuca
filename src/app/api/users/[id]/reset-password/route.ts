import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, validatePasswordStrength } from '@/lib/auth';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

export async function POST(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin'], async (_req: AuthenticatedRequest) => {
    try {
      const { id: userId } = await context.params;

      const body = await _req.json();
      const { temporaryPassword } = body;

      if (!temporaryPassword) {
        return NextResponse.json(
          { error: 'Senha temporária é obrigatória' },
          { status: 400 }
        );
      }

      // Validate password strength
      const passwordCheck = validatePasswordStrength(temporaryPassword);
      if (!passwordCheck.valid) {
        return NextResponse.json(
          { error: `Senha fraca. Requisitos: ${passwordCheck.errors.join(', ')}` },
          { status: 400 }
        );
      }

      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user) {
        return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
      }

      // Prevent admin from resetting their own password this way
      if (user.id === _req.user!.userId) {
        return NextResponse.json(
          { error: 'Use as configurações de perfil para alterar sua própria senha' },
          { status: 400 }
        );
      }

      const hashedPassword = await hashPassword(temporaryPassword);

      await db.user.update({
        where: { id: userId },
        data: {
          password: hashedPassword,
          must_change_password: true,
        },
      });

      await logAction(
        _req.user!.userId,
        'password_reset',
        `Senha resetada pelo admin para o usuário: ${user.email}`,
        _req
      );

      return NextResponse.json({
        message: 'Senha resetada com sucesso! O usuário deverá trocar a senha no próximo login.',
        must_change_password: true,
      });
    } catch (error) {
      console.error('Reset password error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}
