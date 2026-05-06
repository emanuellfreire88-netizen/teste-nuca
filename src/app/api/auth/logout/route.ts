import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest, revokeToken } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    // Extract token from Authorization header and add to blocklist
    const authHeader = req.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      revokeToken(token);
    }

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
