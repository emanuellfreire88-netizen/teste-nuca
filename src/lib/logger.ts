import { NextRequest } from 'next/server';
import { db } from '@/lib/db';

export async function logAction(
  userId: string | null,
  actionType: string,
  description: string,
  req?: NextRequest
): Promise<void> {
  try {
    let ipAddress: string | null = null;
    let device: string | null = null;

    if (req) {
      ipAddress =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        null;

      const userAgent = req.headers.get('user-agent');
      if (userAgent) {
        device = userAgent.substring(0, 255);
      }
    }

    await db.actionLog.create({
      data: {
        user_id: userId,
        action_type: actionType,
        description,
        ip_address: ipAddress,
        device,
      },
    });
  } catch (error) {
    console.error('Failed to log action:', error);
  }
}
