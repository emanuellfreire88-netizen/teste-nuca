/**
 * Rate limiting utility for API endpoints.
 *
 * Uses in-memory storage (Map) which works per-serverless-instance.
 * On Vercel, each instance has its own counter — this provides
 * approximate (not exact) rate limiting across instances, which is
 * sufficient for preventing brute force and abuse.
 *
 * For precise distributed rate limiting, use Upstash Redis or Vercel KV.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const MAX_ENTRIES = 5000; // Prevent unbounded memory growth

// Cleanup expired entries every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now >= entry.resetAt) {
        rateLimitMap.delete(key);
      }
    }
  }, 10 * 60 * 1000).unref?.();
}

export interface RateLimitConfig {
  windowMs: number;       // Time window in milliseconds
  maxRequests: number;    // Max requests per window
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a given key (IP, userId, or combined).
 * Returns whether the request is allowed and remaining quota.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();

  // Evict oldest entries if map is too large
  if (rateLimitMap.size >= MAX_ENTRIES) {
    const oldestKey = rateLimitMap.keys().next().value;
    if (oldestKey) rateLimitMap.delete(oldestKey);
  }

  const entry = rateLimitMap.get(key);

  if (!entry || now >= entry.resetAt) {
    // First request or window expired
    rateLimitMap.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    };
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Get client IP from request headers.
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Pre-configured rate limits for common use cases.
 */
export const RATE_LIMITS = {
  // Public endpoints — stricter limits
  PUBLIC_API: { windowMs: 60 * 1000, maxRequests: 30 },        // 30/min
  CERTIFICATE_LOOKUP: { windowMs: 60 * 1000, maxRequests: 10 }, // 10/min

  // Export endpoints — prevent data exfiltration
  EXPORT: { windowMs: 60 * 1000, maxRequests: 10 },             // 10/min
  PDF_GENERATION: { windowMs: 60 * 1000, maxRequests: 10 },     // 10/min

  // Upload endpoints
  UPLOAD: { windowMs: 60 * 1000, maxRequests: 20 },             // 20/min

  // Auth endpoints (already have custom rate limiting, but as fallback)
  AUTH: { windowMs: 15 * 60 * 1000, maxRequests: 10 },          // 10/15min
} as const;

/**
 * Apply rate limiting to a request. Returns null if allowed,
 * or a NextResponse with 429 if rate limited.
 */
export function applyRateLimit(
  req: Request,
  keyPrefix: string,
  config: RateLimitConfig
): null | { status: number; body: { error: string; retryAfter: number } } {
  const ip = getClientIp(req);
  const key = `${keyPrefix}:${ip}`;
  const result = checkRateLimit(key, config);

  if (!result.allowed) {
    const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
    return {
      status: 429,
      body: {
        error: `Muitas requisições. Tente novamente em ${retryAfterSeconds} segundos.`,
        retryAfter: retryAfterSeconds,
      },
    };
  }

  return null;
}
