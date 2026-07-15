import { db } from '@/lib/db';

type SchoolRef = { id: string; name: string };

/**
 * Safely load a user's assigned schools (M2M relation via UserSchool).
 *
 * The join table has been observed to disappear from the Neon database
 * (likely due to Neon free-tier resets). Any query that `include`s or
 * `select`s the `user_schools` relation crashes with PostgreSQL 42P01
 * ("relation public.user_schools does not exist"), which turns every
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
    const userSchools = await db.userSchool.findMany({
      where: { user_id: userId },
      select: { school: { select: { id: true, name: true } } },
    });
    return userSchools.map((us) => us.school);
  } catch {
    // user_schools table missing or query failed — treat as no assignments.
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
    const userSchools = await db.userSchool.findMany({
      where: { user_id: userId },
      select: { school_id: true },
    });
    return userSchools.map((us) => us.school_id);
  } catch {
    return [];
  }
}
