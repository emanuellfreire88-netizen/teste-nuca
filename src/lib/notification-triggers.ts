/**
 * Notification triggers — creates notifications automatically when events happen.
 *
 * This module centralizes all notification creation logic so that when a
 * dropout risk is detected, a document is pending, or an event is approaching,
 * the right users get notified.
 *
 * Deduplication: each trigger checks if a similar notification already exists
 * before creating a new one (prevents spam).
 */

import { db } from '@/lib/db';

type NotificationType =
  | 'dropout_alert'
  | 'long_absence'
  | 'low_attendance'
  | 'offline_sync'
  | 'info'
  | 'document_pending'
  | 'event_reminder'
  | 'role_changed'
  | 'security_alert';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedStudentId?: string;
}

/**
 * Create a notification with deduplication.
 * Checks if a similar notification (same user + type + related student)
 * was created in the last 24 hours. If so, skips creation.
 */
export async function createNotification({
  userId,
  type,
  title,
  message,
  relatedStudentId,
}: CreateNotificationParams): Promise<void> {
  try {
    // Deduplication: check if similar notification exists in last 24h
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const existing = await db.notification.findFirst({
      where: {
        user_id: userId,
        type,
        related_student_id: relatedStudentId || null,
        created_at: { gte: twentyFourHoursAgo },
      },
      select: { id: true },
    });

    if (existing) {
      // Similar notification already exists — skip to prevent spam
      return;
    }

    await db.notification.create({
      data: {
        user_id: userId,
        type,
        title,
        message,
        related_student_id: relatedStudentId || null,
      },
    });
  } catch (error) {
    console.error('[Notifications] Failed to create notification:', error);
    // Don't throw — notifications are non-critical, shouldn't break the main flow
  }
}

/**
 * Notify all admins about a dropout risk alert.
 * Called when a student's risk level escalates to medium or high.
 */
export async function notifyAdminsOfDropoutRisk(
  studentId: string,
  studentName: string,
  riskLevel: string,
  reasons: string[]
): Promise<void> {
  const admins = await db.user.findMany({
    where: { role: 'Admin', status: 'active' },
    select: { id: true },
  });

  const title = riskLevel === 'high'
    ? '🔴 Alerta de evasão — Alto risco'
    : '🟠 Alerta de evasão — Risco moderado';

  const message = `${studentName} apresenta indicadores de risco (${riskLevel}). Motivos: ${reasons.join(', ')}. Necessita acompanhamento.`;

  for (const admin of admins) {
    await createNotification({
      userId: admin.id,
      type: 'dropout_alert',
      title,
      message,
      relatedStudentId: studentId,
    });
  }
}

/**
 * Notify admins about pending student documents.
 */
export async function notifyDocumentPending(
  studentId: string,
  studentName: string,
  documentType: string
): Promise<void> {
  const admins = await db.user.findMany({
    where: { role: 'Admin', status: 'active' },
    select: { id: true },
  });

  for (const admin of admins) {
    await createNotification({
      userId: admin.id,
      type: 'document_pending',
      title: '📄 Documento pendente',
      message: `${studentName} tem documento pendente: ${documentType}`,
      relatedStudentId: studentId,
    });
  }
}

/**
 * Notify a user that their role was changed.
 */
export async function notifyRoleChanged(
  userId: string,
  oldRole: string,
  newRole: string
): Promise<void> {
  await createNotification({
    userId,
    type: 'role_changed',
    title: '👤 Perfil alterado',
    message: `Seu perfil foi alterado de ${oldRole} para ${newRole}.`,
  });
}

/**
 * Notify admins of a security event (e.g., account locked).
 */
export async function notifySecurityAlert(
  message: string
): Promise<void> {
  const admins = await db.user.findMany({
    where: { role: 'Admin', status: 'active' },
    select: { id: true },
  });

  for (const admin of admins) {
    await createNotification({
      userId: admin.id,
      type: 'security_alert',
      title: '🔒 Alerta de segurança',
      message,
    });
  }
}
