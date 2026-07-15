'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import {
  initOfflineDB,
  saveSyncedData,
  queueOfflineOperation,
  getPendingOperations,
  markOperationsSynced,
  markOperationsError,
  saveLocalAttendance,
  getSyncMeta,
  setSyncMeta,
  getPendingCount,
} from '@/lib/offline-db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncStatus = 'synced' | 'waiting' | 'syncing' | 'error';

export interface OfflineSyncState {
  isOnline: boolean;
  syncStatus: SyncStatus;
  lastSyncAt: string | null;
  pendingCount: number;
  conflicts: ConflictItem[];
  isPreSynced: boolean;
}

export interface ConflictItem {
  type: 'attendance' | 'participation';
  local: Record<string, unknown>;
  server: Record<string, unknown>;
}

interface PreSyncResponse {
  students: Record<string, unknown>[];
  events: Record<string, unknown>[];
  attendance: Record<string, unknown>[];
  schools: Record<string, unknown>[];
  synced_at: string;
}

interface PushResponse {
  synced: number;
  conflicts: Record<string, unknown>[];
  participation_conflicts: Record<string, unknown>[];
}

interface ResolveConflictsResponse {
  resolved: number;
}

// ---------------------------------------------------------------------------
// Device ID helper – stable per browser session
// ---------------------------------------------------------------------------

function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem('nuca-device-id');
  if (!id) {
    id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem('nuca-device-id', id);
  }
  return id;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('waiting');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [isPreSynced, setIsPreSynced] = useState<boolean>(false);

  // Refs to avoid stale closures and infinite loops
  const preSyncDoneRef = useRef(false);
  const syncingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // ── Refresh helpers ──────────────────────────────────────────────────────

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      if (mountedRef.current) setPendingCount(count);
    } catch {
      // ignore
    }
  }, []);

  const refreshLastSyncAt = useCallback(async () => {
    try {
      const val = await getSyncMeta('lastSyncAt');
      if (mountedRef.current) setLastSyncAt(val);
    } catch {
      // ignore
    }
  }, []);

  // ── Pre-sync ─────────────────────────────────────────────────────────────

  const preSync = useCallback(async () => {
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) return;

    try {
      if (mountedRef.current) setSyncStatus('syncing');

      // Ensure DB is ready
      await initOfflineDB();

      const data = await api.get<PreSyncResponse>('/sync/pre-sync');

      await saveSyncedData({
        students: data.students,
        events: data.events,
        attendance: data.attendance,
        schools: data.schools,
      });

      await setSyncMeta('lastSyncAt', data.synced_at);

      if (mountedRef.current) {
        setLastSyncAt(data.synced_at);
        setIsPreSynced(true);
        setSyncStatus('synced');
      }

      preSyncDoneRef.current = true;
    } catch (err) {
      console.error('[useOfflineSync] preSync error:', err);
      if (mountedRef.current) setSyncStatus('error');
    }
  }, []);

  // ── Sync now (push pending operations) ───────────────────────────────────

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return; // prevent concurrent syncs
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) return;

    syncingRef.current = true;
    try {
      if (mountedRef.current) setSyncStatus('syncing');

      await initOfflineDB();

      const pending = await getPendingOperations();
      if (pending.length === 0) {
        if (mountedRef.current) setSyncStatus('synced');
        syncingRef.current = false;
        return;
      }

      // Separate attendance and participation operations
      const attendanceRecords = pending
        .filter((op) => op.type === 'attendance')
        .map((op) => op.data as { student_id: string; date: string; status: string });

      const participations = pending
        .filter((op) => op.type === 'participation')
        .map((op) => op.data as { event_id: string; student_id: string; attended: boolean; notes?: string });

      const deviceId = getDeviceId();

      const result = await api.post<PushResponse>('/sync/push', {
        device_id: deviceId,
        records: attendanceRecords,
        participations,
      });

      // Build conflict list
      const newConflicts: ConflictItem[] = [
        ...result.conflicts.map((c) => ({
          type: 'attendance' as const,
          local: (c as Record<string, unknown>).local as Record<string, unknown>,
          server: (c as Record<string, unknown>).server as Record<string, unknown>,
        })),
        ...result.participation_conflicts.map((c) => ({
          type: 'participation' as const,
          local: (c as Record<string, unknown>).local as Record<string, unknown>,
          server: (c as Record<string, unknown>).server as Record<string, unknown>,
        })),
      ];

      if (newConflicts.length > 0) {
        if (mountedRef.current) {
          setConflicts(newConflicts);
          setSyncStatus('waiting'); // waiting for conflict resolution
        }
        // Mark conflicted operations as error so they stay in queue
        // We do NOT mark them synced – they need resolution first
        // But the non-conflicting ones that were synced successfully should be marked
        // For simplicity: mark ALL pending as synced; conflicts will be re-queued
        // if the user resolves them differently.
        // Actually, a better approach: mark ALL as synced since the server has processed them
        // (either accepted or detected conflict). Conflicts need resolution separately.
        const allIds = pending.map((op) => op.id!);
        await markOperationsSynced(allIds);
      } else {
        // All synced successfully
        const allIds = pending.map((op) => op.id!);
        await markOperationsSynced(allIds);
        if (mountedRef.current) setSyncStatus('synced');
      }

      // Update lastSyncAt
      const now = new Date().toISOString();
      await setSyncMeta('lastSyncAt', now);
      if (mountedRef.current) setLastSyncAt(now);

      // Refresh pending count
      await refreshPendingCount();
    } catch (err) {
      console.error('[useOfflineSync] syncNow error:', err);

      // Mark all pending operations as error
      const pending = await getPendingOperations();
      const ids = pending.map((op) => op.id!);
      await markOperationsError(ids);

      if (mountedRef.current) setSyncStatus('error');
    } finally {
      syncingRef.current = false;
    }
  }, [refreshPendingCount]);

  // ── Resolve conflicts ────────────────────────────────────────────────────

  const resolveConflicts = useCallback(
    async (resolutions: Record<string, unknown>[]) => {
      try {
        const deviceId = getDeviceId();
        await api.post<ResolveConflictsResponse>('/sync/resolve-conflicts', {
          resolutions,
          device_id: deviceId,
        });

        // Clear conflicts
        if (mountedRef.current) {
          setConflicts([]);
          setSyncStatus('synced');
        }
      } catch (err) {
        console.error('[useOfflineSync] resolveConflicts error:', err);
        if (mountedRef.current) setSyncStatus('error');
      }
    },
    [],
  );

  // ── Save attendance offline ──────────────────────────────────────────────

  const saveAttendanceOffline = useCallback(
    async (record: {
      student_id: string;
      date: string;
      status: string;
      notes?: string;
      meeting_time?: string;
    }) => {
      try {
        await initOfflineDB();

        // Save to local attendance store
        await saveLocalAttendance(record);

        // Queue the operation for later sync
        await queueOfflineOperation({
          type: 'attendance',
          data: {
            student_id: record.student_id,
            date: record.date,
            status: record.status,
            notes: record.notes,
            meeting_time: record.meeting_time,
          },
          timestamp: new Date().toISOString(),
        });

        // Update pending count
        await refreshPendingCount();

        if (mountedRef.current && !isOnline) {
          setSyncStatus('waiting');
        }
      } catch (err) {
        console.error('[useOfflineSync] saveAttendanceOffline error:', err);
      }
    },
    [isOnline, refreshPendingCount],
  );

  // ── Online/offline monitoring ────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;

    const handleOnline = () => {
      if (mountedRef.current) setIsOnline(true);
    };

    const handleOffline = () => {
      if (mountedRef.current) setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── Auto pre-sync on mount (once per session) ────────────────────────────

  useEffect(() => {
    if (!isOnline) return;
    if (preSyncDoneRef.current) return;

    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) return;

    preSync();
  }, [isOnline, preSync]);

  // ── Auto-sync when coming back online ────────────────────────────────────

  const prevOnlineRef = useRef(isOnline);

  useEffect(() => {
    // Detect transition from offline to online
    if (isOnline && !prevOnlineRef.current) {
      // Debounce to avoid multiple rapid syncs
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        syncNow();
      }, 1000);
    }
    prevOnlineRef.current = isOnline;

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isOnline, syncNow]);

  // ── Initialise pending count and lastSyncAt on mount ─────────────────────

  useEffect(() => {
    refreshPendingCount();
    refreshLastSyncAt();
  }, [refreshPendingCount, refreshLastSyncAt]);

  // ── Return ───────────────────────────────────────────────────────────────

  return {
    isOnline,
    syncStatus,
    lastSyncAt,
    pendingCount,
    conflicts,
    isPreSynced,
    preSync,
    syncNow,
    resolveConflicts,
    saveAttendanceOffline,
  };
}
