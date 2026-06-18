/**
 * Case-insensitive search helper for Prisma `contains` filters.
 *
 * Why this exists:
 * - On PostgreSQL (Vercel), Prisma's `contains` is CASE-SENSITIVE by default.
 *   We need `mode: 'insensitive'` to make it case-insensitive.
 * - On SQLite (local dev), Prisma's `contains` uses `LIKE` which is already
 *   case-insensitive for ASCII, and `mode: 'insensitive'` is NOT supported
 *   (Prisma throws a runtime error).
 *
 * This helper detects the database provider from `DATABASE_URL` and returns
 * the appropriate filter object, so the same code works on both databases.
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

export function ciContains(search: string): { contains: string; mode?: 'insensitive' } {
  const dbUrl = process.env.DATABASE_URL || '';
  const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://');

  if (isPostgres) {
    return { contains: search, mode: 'insensitive' };
  }
  // SQLite: `contains` uses LIKE which is case-insensitive for ASCII
  return { contains: search };
}
