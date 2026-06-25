/**
 * Case-insensitive search helper for Prisma `contains` filters.
 *
 * Why this exists:
 * - On PostgreSQL (Vercel/Neon), Prisma's `contains` is CASE-SENSITIVE by
 *   default. We need `mode: 'insensitive'` to make it case-insensitive.
 *
 * This project's Prisma schema (`prisma/schema.prisma`) is hardcoded to
 * `provider = "postgresql"`, so we ALWAYS use insensitive mode. There is no
 * SQLite fallback — the previous runtime env-var detection was unreliable
 * because the shell can override `DATABASE_URL` with a non-Postgres value
 * (e.g. `file:...`) while Prisma itself still connects to Postgres via the
 * `.env` file, which made searches silently case-sensitive.
 *
 * @example
 * // Instead of: { full_name: { contains: search } }
 * // Use: { full_name: ciContains(search) }
 *
 * @example
 * // For OR clauses:
 * where.OR = [
 *   { full_name: ciContains(search) },
 *   { email: ciContains(search) },
 * ];
 */

export function ciContains(search: string): { contains: string; mode: 'insensitive' } {
  return { contains: search, mode: 'insensitive' };
}


