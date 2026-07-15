'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useOfflineSync, OfflineSyncState } from '@/hooks/use-offline-sync';

// ---------------------------------------------------------------------------
// Context type – state + actions
// ---------------------------------------------------------------------------

type OfflineSyncContextValue = OfflineSyncState & {
  preSync: () => Promise<void>;
  syncNow: () => Promise<void>;
  resolveConflicts: (resolutions: Record<string, unknown>[]) => Promise<void>;
  saveAttendanceOffline: (record: {
    student_id: string;
    date: string;
    status: string;
    notes?: string;
    meeting_time?: string;
  }) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Context with safe defaults
// ---------------------------------------------------------------------------

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const syncState = useOfflineSync();
  return (
    <OfflineSyncContext.Provider value={syncState}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useOfflineSyncContext(): OfflineSyncContextValue {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) {
    throw new Error(
      'useOfflineSyncContext must be used within an OfflineSyncProvider',
    );
  }
  return ctx;
}
