import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { isTokenRevoked } from '@/lib/middleware';
import { generateVerificationCode, sendVerificationEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // Require authentication to prevent abuse/email bombing
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    
    if (isTokenRevoked(token)) {
      return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'ID do usuário é obrigatório' },
        { status: 400 }
      );
    }

    // Only allow resending for the authenticated user's own ID
    if (payload.userId !== userId) {
      return NextResponse.json(
        { error: 'Você só pode reenviar código para sua própria conta' },
        { status: 403 }
      );
    }

    const user = await db.user.findUnique({ where: { id: userId } });

    if (!user) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    if (!user.two_factor_enabled) {
      return NextResponse.json(
        { error: '2FA não está ativado para este usuário' },
        { status: 400 }
      );
    }

    // Generate new code
    const code = generateVerificationCode();
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.user.update({
      where: { id: user.id },
      data: {
        two_factor_secret: code,
        locked_until: codeExpires,
      },
    });

    // Send verification email
    const emailResult = await sendVerificationEmail(user.email, user.full_name, code);

    if (!emailResult.success) {
      return NextResponse.json(
        { error: emailResult.error || 'Erro ao enviar código de verificação.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Novo código enviado para seu e-mail.',
    });
  } catch (error) {
    console.error('Resend 2FA error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
