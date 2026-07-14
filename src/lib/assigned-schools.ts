import { db } from '@/lib/db';

type SchoolRef = { id: string; name: string };

/**
 * Safely load a user's assigned schools (M2M relation via _OperatorSchools).
 *
 * The join table has been observed to disappear from the Neon database
 * (likely due to Neon free-tier resets). Any query that `include`s or
 * `select`s the `assigned_schools` relation crashes with PostgreSQL 42P01
 * ("relation public._OperatorSchools does not exist"), which turns every
 * login into a 500. This helper isolates that query so a missing table
 * degrades gracefully to an empty assignment list instead of failing the
 * whole request.
 *
 * NOTE: This intentionally does NOT create or modify any database object.
 */
export async function getAssignedSchoolsSafe(
  userId: string
): Promise<SchoolRef[]> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { assigned_schools: { select: { id: true, name: true } } },
    });
    return user?.assigned_schools ?? [];
  } catch {
    // _OperatorSchools table missing or query failed — treat as no assignments.
    return [];
  }
}

/**
 * Same as getAssignedSchoolsSafe but returns only the school IDs (used by
 * the auth middleware for school-level RBAC checks).
 */
export async function getAssignedSchoolIdsSafe(
  userId: string
): Promise<string[]> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { assigned_schools: { select: { id: true } } },
    });
    return (user?.assigned_schools ?? []).map((s) => s.id);
  } catch {
    return [];
  }
}
