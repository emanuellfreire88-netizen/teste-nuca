import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    await logAction(req.user!.userId, 'logout', `Logout realizado: ${req.user!.email}`, req);

    return NextResponse.json({ message: 'Logout realizado com sucesso' });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
