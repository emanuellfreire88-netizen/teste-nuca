import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

// JWT_SECRET: Must be set in production. Lazy initialization to avoid build-time crashes.
// Uses globalThis to persist the secret across Next.js hot reloads.
const globalForAuth = globalThis as unknown as { __jwtSecret?: string };

function getJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  // In production (runtime), JWT_SECRET must be set
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }

  // Reuse the same secret across hot reloads in development
  if (!globalForAuth.__jwtSecret) {
    console.warn('⚠️  JWT_SECRET not set. Using random fallback for development only. Set JWT_SECRET in production!');
    globalForAuth.__jwtSecret = randomBytes(32).toString('hex');
  }
  return globalForAuth.__jwtSecret;
}

const JWT_EXPIRES_IN = '24h';
export const JWT_EXPIRES_IN_SECONDS = 24 * 60 * 60; // 86400 seconds
const JWT_ISSUER = 'nuca-plataforma';
const JWT_AUDIENCE = 'nuca-plataforma-users';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  must_change_password?: boolean;
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hasRole(userRole: string, requiredRoles: string[]): boolean {
  return requiredRoles.includes(userRole);
}

export function isAdmin(role: string): boolean {
  return role === 'Admin';
}

export function isOperatorOrAbove(role: string): boolean {
  return role === 'Admin' || role === 'Operator';
}

/**
 * Validate password strength:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Mínimo de 8 caracteres');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Pelo menos uma letra maiúscula');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Pelo menos uma letra minúscula');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Pelo menos um número');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Pelo menos um caractere especial (!@#$%...)');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Sanitize string input - remove potential XSS vectors
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}
