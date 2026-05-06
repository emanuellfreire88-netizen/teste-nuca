import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, JwtPayload, JWT_EXPIRES_IN_SECONDS } from '@/lib/auth';
import { db } from '@/lib/db';

export interface AuthenticatedRequest extends NextRequest {
  user?: JwtPayload;
}

type HandlerFunction = (
  req: AuthenticatedRequest,
  context?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse> | NextResponse;

// ---------------------------------------------------------------------------
// Security headers applied to all API responses
// ---------------------------------------------------------------------------
function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Content-Security-Policy', "default-src 'self'");
  return response;
}

// ---------------------------------------------------------------------------
// Token blocklist for logout invalidation
// ---------------------------------------------------------------------------
interface BlocklistEntry {
  expiresAt: number;
}

const tokenBlocklist = new Map<string, BlocklistEntry>();
const BLOCKLIST_MAX_SIZE = 10000;

// Periodic cleanup of expired blocklist entries (every 10 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [token, entry] of tokenBlocklist.entries()) {
      if (now >= entry.expiresAt) {
        tokenBlocklist.delete(token);
      }
    }
  }, 10 * 60 * 1000).unref?.();
}

/**
 * Add a token to the blocklist (used on logout).
 * The entry lives for the same duration as the JWT expiry.
 */
export function revokeToken(token: string): void {
  // Evict oldest entries if blocklist is too large
  if (tokenBlocklist.size >= BLOCKLIST_MAX_SIZE) {
    const oldestKey = tokenBlocklist.keys().next().value;
    if (oldestKey) tokenBlocklist.delete(oldestKey);
  }

  tokenBlocklist.set(token, {
    expiresAt: Date.now() + JWT_EXPIRES_IN_SECONDS * 1000,
  });
}

/**
 * Check whether a token has been revoked.
 */
export function isTokenRevoked(token: string): boolean {
  const entry = tokenBlocklist.get(token);
  if (!entry) return false;
  // If expired, clean up and consider it not revoked (JWT itself is expired anyway)
  if (Date.now() >= entry.expiresAt) {
    tokenBlocklist.delete(token);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Cache verified user roles in memory with TTL to reduce DB queries
// ---------------------------------------------------------------------------
const userRoleCache = new Map<string, { role: string; status: string; cachedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 1000; // Prevent unbounded memory growth

// Periodic cleanup of expired cache entries (every 10 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of userRoleCache.entries()) {
      if (now - value.cachedAt > CACHE_TTL) {
        userRoleCache.delete(key);
      }
    }
  }, 10 * 60 * 1000).unref?.(); // Don't prevent process exit
}

async function verifyUserInDB(userId: string): Promise<{ role: string; status: string } | null> {
  // Check cache first
  const cached = userRoleCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return { role: cached.role, status: cached.status };
  }

  // Evict oldest entries if cache is too large
  if (userRoleCache.size >= CACHE_MAX_SIZE) {
    const oldestKey = userRoleCache.keys().next().value;
    if (oldestKey) userRoleCache.delete(oldestKey);
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
      return withSecurityHeaders(NextResponse.json(
        { error: 'Token não fornecido' },
        { status: 401 }
      ));
    }

    const token = authHeader.split(' ')[1];

    // Check if token has been revoked (e.g. after logout)
    if (isTokenRevoked(token)) {
      return withSecurityHeaders(NextResponse.json(
        { error: 'Token inválido ou expirado' },
        { status: 401 }
      ));
    }

    const payload = verifyToken(token);

    if (!payload) {
      return withSecurityHeaders(NextResponse.json(
        { error: 'Token inválido ou expirado' },
        { status: 401 }
      ));
    }

    // Verify user still exists and is active in the database
    // This prevents deleted or deactivated users from using old tokens
    const dbUser = await verifyUserInDB(payload.userId);

    if (dbUser === null) {
      // DB lookup failed - fail closed for security (block access)
      // This prevents unauthorized access when DB is unavailable
      return withSecurityHeaders(NextResponse.json(
        { error: 'Erro ao verificar credenciais. Tente novamente.' },
        { status: 503 }
      ));
    }

    if (dbUser.status === 'inactive') {
      return withSecurityHeaders(NextResponse.json(
        { error: 'Conta desativada. Contate o administrador.' },
        { status: 403 }
      ));
    }

    // Update the payload with the current role from DB
    // This prevents privilege escalation if role was changed after token was issued
    (req as AuthenticatedRequest).user = {
      ...payload,
      role: dbUser.role,
    };

    const response = await handler(req as AuthenticatedRequest, context);
    return withSecurityHeaders(response);
  };
}

export function withRole(requiredRoles: string[], handler: HandlerFunction): HandlerFunction {
  return withAuth(async (req, context) => {
    const user = req.user;

    if (!user || !requiredRoles.includes(user.role)) {
      return withSecurityHeaders(NextResponse.json(
        { error: 'Permissão insuficiente' },
        { status: 403 }
      ));
    }

    const response = await handler(req, context);
    return withSecurityHeaders(response);
  });
}
