import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
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
    const { enabled } = body;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Parâmetro "enabled" é obrigatório' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Only Admin users can toggle 2FA for themselves
    // (In the future, we could allow any user to enable/disable their own 2FA)
    await db.user.update({
      where: { id: user.id },
      data: {
        two_factor_enabled: enabled,
        // Clear any pending verification codes when disabling
        ...(enabled ? {} : {
          verification_code: null,
          verification_code_expires: null,
        }),
      },
    });

    await logAction(
      user.id,
      enabled ? '2fa_enabled' : '2fa_disabled',
      `Autenticação de dois fatores ${enabled ? 'ativada' : 'desativada'} para ${user.email}`,
      req
    );

    return NextResponse.json({
      message: `Autenticação de dois fatores ${enabled ? 'ativada' : 'desativada'} com sucesso!`,
      two_factor_enabled: enabled,
    });
  } catch (error) {
    console.error('Toggle 2FA error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
