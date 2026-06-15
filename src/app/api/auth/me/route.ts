import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user!.userId },
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
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Get current user error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
