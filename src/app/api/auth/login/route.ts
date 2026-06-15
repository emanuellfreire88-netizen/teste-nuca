import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { comparePassword, generateToken, validatePasswordStrength } from '@/lib/auth';
import { logAction } from '@/lib/logger';
import { generateVerificationCode, sendVerificationEmail } from '@/lib/email';

// In-memory rate limiter for login attempts
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS_PER_IP = 10; // Max 10 attempts per IP per window
const MAX_ENTRIES = 5000; // Prevent unbounded memory growth

// Periodic cleanup of expired login attempt entries (every 15 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of loginAttempts.entries()) {
      if (now - value.lastAttempt > RATE_LIMIT_WINDOW) {
        loginAttempts.delete(key);
      }
    }
  }, 15 * 60 * 1000).unref?.();
}

function isRateLimited(ip: string): boolean {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;

  // Clean up old entries
  if (Date.now() - entry.lastAttempt > RATE_LIMIT_WINDOW) {
    loginAttempts.delete(ip);
    return false;
  }

  return entry.count >= MAX_ATTEMPTS_PER_IP;
}

function recordAttempt(ip: string): void {
  // Evict oldest entries if map is too large
  if (loginAttempts.size >= MAX_ENTRIES) {
    const oldestKey = loginAttempts.keys().next().value;
    if (oldestKey) loginAttempts.delete(oldestKey);
  }

  const entry = loginAttempts.get(ip);
  if (!entry || Date.now() - entry.lastAttempt > RATE_LIMIT_WINDOW) {
    loginAttempts.set(ip, { count: 1, lastAttempt: Date.now() });
  } else {
    entry.count++;
    entry.lastAttempt = Date.now();
  }
}

function clearAttempt(ip: string): void {
  loginAttempts.delete(ip);
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting by IP
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    if (isRateLimited(clientIp)) {
      return NextResponse.json(
        { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { email, password, remember } = body;

    if (!email || !password) {
      recordAttempt(clientIp);
      return NextResponse.json(
        { error: 'Email e senha são obrigatórios' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      recordAttempt(clientIp);
      return NextResponse.json(
        { error: 'Formato de email inválido' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { email } });

    if (!user) {
      recordAttempt(clientIp);
      // Use generic error message to prevent user enumeration
      await logAction(null, 'login_failed', 'Tentativa de login falhou para email não registrado', req);
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      );
    }

    // Check if user is inactive - use generic message to prevent user enumeration
    if (user.status === 'inactive') {
      recordAttempt(clientIp);
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      );
    }

    // Check if account is locked — use generic message to prevent user enumeration
    if (
      user.failed_login_attempts >= 5 &&
      user.locked_until &&
      new Date(user.locked_until) > new Date()
    ) {
      recordAttempt(clientIp);
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      );
    }

    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      recordAttempt(clientIp);

      // Increment failed login attempts
      const newAttempts = user.failed_login_attempts + 1;
      const lockUntil =
        newAttempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null; // 30 min lock

      await db.user.update({
        where: { id: user.id },
        data: {
          failed_login_attempts: newAttempts,
          locked_until: lockUntil,
        },
      });

      // Log failed attempt — do not reveal whether user exists
      await logAction(null, 'login_failed', 'Tentativa de login falhou: credenciais inválidas', req);

      // Always return the same generic message regardless of remaining attempts
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      );
    }

    // Successful password check - clear rate limit and reset failed attempts
    clearAttempt(clientIp);

    // ── 2FA Check ──────────────────────────────────────────────────────
    // If 2FA is enabled for this user, send verification code to email
    if (user.two_factor_enabled) {
      const code = generateVerificationCode();
      const codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await db.user.update({
        where: { id: user.id },
        data: {
          verification_code: code,
          verification_code_expires: codeExpires,
          failed_login_attempts: 0,
          locked_until: null,
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

      // Return a special response indicating 2FA is required
      // Do NOT return the token yet — user must verify the code first
      return NextResponse.json({
        requires2FA: true,
        userId: user.id,
        email: user.email,
        message: 'Código de verificação enviado para seu e-mail.',
      });
    }

    // ── No 2FA — login directly ──────────────────────────────────────
    await db.user.update({
      where: { id: user.id },
      data: {
        failed_login_attempts: 0,
        locked_until: null,
        last_login: new Date(),
      },
    });

    // Generate JWT
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Log successful login
    await logAction(user.id, 'login', `Login realizado: ${user.email}`, req);

    // Return user info without password or sensitive fields
    const { password: _, two_factor_secret: __, verification_code: ___, verification_code_expires: ____, ...userWithoutSensitive } = user;

    return NextResponse.json({
      token,
      user: {
        ...userWithoutSensitive,
        last_login: new Date(),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
