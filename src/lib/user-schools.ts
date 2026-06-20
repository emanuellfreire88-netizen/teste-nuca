import { db } from '@/lib/db';

/**
 * Returns the list of school IDs the given user is allowed to access.
 *
 * - Admins implicitly have access to ALL schools (returns null to signal
 *   "no filter needed").
 * - Operators / Viewers return the explicit list of school IDs linked via
 *   the `user_schools` junction table. If none are linked, returns an empty
 *   array (meaning: no access to any school).
 *
 * @param userId  The user id from the JWT payload.
 * @param role    The user role from the JWT payload.
 * @returns `null` for Admin (no filter), or `string[]` of school IDs.
 */
export async function getUserSchoolIds(
  userId: string,
  role: string
): Promise<string[] | null> {
  // Admins have unrestricted access — signal with null so callers can skip
  // building a where-clause filter entirely.
  if (role === 'Admin') {
    return null;
  }

  const rows = await db.userSchool.findMany({
    where: { user_id: userId },
    select: { school_id: true },
  });

  return rows.map((r) => r.school_id);
}

/**
 * Convenience wrapper that returns a NON-null array of school IDs.
 * Admins get an empty array (meaning "all"), non-admins get their linked IDs.
 * Useful when you just need the list and handle the "all" case separately.
 */
export async function getUserSchoolIdsList(
  userId: string,
  role: string
): Promise<string[]> {
  const ids = await getUserSchoolIds(userId, role);
  return ids ?? [];
}

/**
 * Verifies whether a non-admin user is allowed to access a given school.
 * Admins always pass. Non-admins must have an explicit UserSchool row.
 */
export async function canUserAccessSchool(
  userId: string,
  role: string,
  schoolId: string
): Promise<boolean> {
  if (role === 'Admin') return true;

  const count = await db.userSchool.count({
    where: { user_id: userId, school_id: schoolId },
  });

  return count > 0;
}
