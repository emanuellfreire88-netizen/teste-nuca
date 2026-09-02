/**
 * Badge auto-generation logic.
 *
 * When an event participant's attendance is updated, this function checks
 * if the student has earned any new badges and creates them.
 *
 * Badge rules:
 * - first_participation: first event attended
 * - 5_events: attended 5 events
 * - 10_events: attended 10 events
 * - 20_events: attended 20 events
 * - 50_events: attended 50 events
 *
 * Deduplication: @@unique([student_id, badge_type]) prevents duplicates.
 */

import { db } from '@/lib/db';
import { logAction } from '@/lib/logger';

const BADGE_THRESHOLDS: Array<{ type: string; count: number }> = [
  { type: 'first_participation', count: 1 },
  { type: '5_events', count: 5 },
  { type: '10_events', count: 10 },
  { type: '20_events', count: 20 },
  { type: '50_events', count: 50 },
];

/**
 * Check and award badges for a student based on their event participation count.
 * Called after attendance is recorded for an event.
 *
 * @param studentId - The student ID to check
 * @param userId - The user who triggered the check (for logging)
 */
export async function checkAndAwardBadges(studentId: string, userId?: string): Promise<void> {
  try {
    // Count total events the student attended
    const attendedCount = await db.eventParticipant.count({
      where: {
        student_id: studentId,
        attended: true,
      },
    });

    // Check each badge threshold
    for (const { type, count } of BADGE_THRESHOLDS) {
      if (attendedCount >= count) {
        // Check if badge already exists (deduplication)
        const existing = await db.participationBadge.findUnique({
          where: {
            student_id_badge_type: {
              student_id: studentId,
              badge_type: type,
            },
          },
          select: { id: true },
        });

        if (!existing) {
          // Award the badge
          await db.participationBadge.create({
            data: {
              student_id: studentId,
              badge_type: type,
            },
          });

          if (userId) {
            await logAction(
              userId,
              'badge_awarded',
              `Badge '${type}' concedido ao aluno (total participações: ${attendedCount})`,
            );
          }

          console.log(`[Badges] Aluno ${studentId} recebeu badge: ${type} (${attendedCount} participações)`);
        }
      }
    }
  } catch (error) {
    console.error('[Badges] Erro ao verificar badges:', error);
    // Don't throw — badges are non-critical, shouldn't break attendance flow
  }
}
