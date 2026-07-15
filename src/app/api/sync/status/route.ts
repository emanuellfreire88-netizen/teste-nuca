import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';

/**
 * GET /api/sync/status
 *
 * Get current sync status for the device.
 * Query param: device_id (required)
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const device_id = searchParams.get('device_id');

    if (!device_id) {
      return NextResponse.json(
        { error: 'device_id é obrigatório' },
        { status: 400 }
      );
    }

    const userId = req.user!.userId;

    // Find or create the SyncRecord for this device/user
    let syncRecord = await db.syncRecord.findUnique({
      where: {
        device_id_user_id: {
          device_id,
          user_id: userId,
        },
      },
    });

    if (!syncRecord) {
      // Create a default SyncRecord if none exists
      syncRecord = await db.syncRecord.create({
        data: {
          device_id,
          user_id: userId,
          last_sync_at: new Date(),
          sync_status: 'synced',
          pending_count: 0,
        },
      });
    }

    return NextResponse.json({
      last_sync_at: syncRecord.last_sync_at.toISOString(),
      sync_status: syncRecord.sync_status,
      pending_count: syncRecord.pending_count,
    });
  } catch (error) {
    console.error('Get sync status error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/sync/status
 *
 * Update sync status for the device.
 * Body: { device_id, sync_status, pending_count }
 */
export const PUT = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const { device_id, sync_status, pending_count } = body as {
      device_id?: string;
      sync_status?: string;
      pending_count?: number;
    };

    if (!device_id) {
      return NextResponse.json(
        { error: 'device_id é obrigatório' },
        { status: 400 }
      );
    }

    const validStatuses = ['synced', 'pending', 'syncing', 'error'];
    if (sync_status && !validStatuses.includes(sync_status)) {
      return NextResponse.json(
        { error: `sync_status inválido. Valores permitidos: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const userId = req.user!.userId;

    const syncRecord = await db.syncRecord.upsert({
      where: {
        device_id_user_id: {
          device_id,
          user_id: userId,
        },
      },
      create: {
        device_id,
        user_id: userId,
        last_sync_at: new Date(),
        sync_status: sync_status || 'synced',
        pending_count: pending_count ?? 0,
      },
      update: {
        last_sync_at: new Date(),
        ...(sync_status !== undefined ? { sync_status } : {}),
        ...(pending_count !== undefined ? { pending_count } : {}),
      },
    });

    return NextResponse.json({
      last_sync_at: syncRecord.last_sync_at.toISOString(),
      sync_status: syncRecord.sync_status,
      pending_count: syncRecord.pending_count,
    });
  } catch (error) {
    console.error('Update sync status error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
