import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { logAction } from '@/lib/logger';
import { sendVerificationEmail, generateVerificationCode } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

    // When enabling 2FA, test email delivery first
    if (enabled) {
      const testCode = generateVerificationCode();
      const testResult = await sendVerificationEmail(user.email, user.full_name, testCode);

      if (!testResult.success) {
        // Email delivery failed — don't enable 2FA
        return NextResponse.json(
          {
            error: testResult.error || 'Não foi possível enviar o e-mail de teste. Verifique a configuração do serviço de e-mail.',
            emailError: true,
          },
          { status: 400 }
        );
      }

      // Test email sent successfully — save this code as the first verification code
      // and enable 2FA. The user will need to verify this code to complete setup.
      await db.user.update({
        where: { id: user.id },
        data: {
          two_factor_enabled: true,
          two_factor_secret: testCode,
          locked_until: new Date(Date.now() + 10 * 60 * 1000),
        },
      });

      await logAction(
        user.id,
        '2fa_enabled',
        `Autenticação de dois fatores ativada para ${user.email}`,
        req
      );

      return NextResponse.json({
        message: 'Autenticação de dois fatores ativada! Um código de verificação foi enviado para seu e-mail.',
        two_factor_enabled: true,
        requiresVerification: true,
        email: user.email,
      });
    }

    // Disabling 2FA — no email test needed
    await db.user.update({
      where: { id: user.id },
      data: {
        two_factor_enabled: false,
        two_factor_secret: null,
        locked_until: null,
      },
    });

    await logAction(
      user.id,
      '2fa_disabled',
      `Autenticação de dois fatores desativada para ${user.email}`,
      req
    );

    return NextResponse.json({
      message: 'Autenticação de dois fatores desativada.',
      two_factor_enabled: false,
    });
  } catch (error) {
    console.error('Toggle 2FA error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
