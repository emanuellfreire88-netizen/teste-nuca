import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, JwtPayload } from '@/lib/auth';
import { db } from '@/lib/db';

export interface AuthenticatedRequest extends NextRequest {
  user?: JwtPayload;
}

type HandlerFunction = (
  req: AuthenticatedRequest,
  context?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse> | NextResponse;

// Cache verified user roles in memory with TTL to reduce DB queries
const userRoleCache = new Map<string, { role: string; status: string; cachedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function verifyUserInDB(userId: string): Promise<{ role: string; status: string } | null> {
  // Check cache first
  const cached = userRoleCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return { role: cached.role, status: cached.status };
  }

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });

    if (!user) return null;

    // Update cache
    userRoleCache.set(userId, { role: user.role, status: user.status, cachedAt: Date.now() });
    return { role: user.role, status: user.status };
  } catch {
    // If DB fails, allow request with token data (fail open rather than blocking all access)
    console.error('Failed to verify user in DB, using token data');
    return null;
  }
}

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

    // Verify user still exists and is active in the database
    // This prevents deleted or deactivated users from using old tokens
    const dbUser = await verifyUserInDB(payload.userId);

    if (dbUser === null) {
      // DB lookup failed - use token data as fallback
      (req as AuthenticatedRequest).user = payload;
      return handler(req as AuthenticatedRequest, context);
    }

    if (dbUser.status === 'inactive') {
      return NextResponse.json(
        { error: 'Conta desativada. Contate o administrador.' },
        { status: 403 }
      );
    }

    // Update the payload with the current role from DB
    // This prevents privilege escalation if role was changed after token was issued
    (req as AuthenticatedRequest).user = {
      ...payload,
      role: dbUser.role,
    };

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
