import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, JwtPayload } from '@/lib/auth';

export interface AuthenticatedRequest extends NextRequest {
  user?: JwtPayload;
}

type HandlerFunction = (
  req: AuthenticatedRequest,
  context?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse> | NextResponse;

export function withAuth(handler: HandlerFunction): HandlerFunction {
  return async (req, context) => {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Token não fornecido' },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { error: 'Token inválido ou expirado' },
        { status: 401 }
      );
    }

    (req as AuthenticatedRequest).user = payload;
    return handler(req as AuthenticatedRequest, context);
  };
}

export function withRole(requiredRoles: string[], handler: HandlerFunction): HandlerFunction {
  return withAuth(async (req, context) => {
    const user = req.user;

    if (!user || !requiredRoles.includes(user.role)) {
      return NextResponse.json(
        { error: 'Permissão insuficiente' },
        { status: 403 }
      );
    }

    return handler(req, context);
  });
}
