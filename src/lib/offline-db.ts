/**
 * IndexedDB offline storage library for the NUCA platform.
 *
 * Database: nuca-offline-db (version 1)
 * Stores: students, events, attendance, schools, syncQueue, syncMeta
 *
 * All operations are promise-based with graceful error handling.
 */

const DB_NAME = 'nuca-offline-db';
const DB_VERSION = 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncQueueItem {
  id?: number;
  type: 'attendance' | 'participation';
  data: Record<string, unknown>;
  timestamp: string;
  status: 'pending' | 'synced' | 'error';
}

export interface AttendanceRecord {
  id?: number;
  student_id: string;
  date: string; // YYYY-MM-DD
  status: string; // present | absent | justified_absence
  notes?: string;
  meeting_time?: string;
  compound_key: string; // `${student_id}_${date}` – used as unique index
}

// ---------------------------------------------------------------------------
// Database initialisation
// ---------------------------------------------------------------------------

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (_event) => {
      const db = request.result;

      // ── students ──
      if (!db.objectStoreNames.contains('students')) {
        const studentsStore = db.createObjectStore('students', { keyPath: 'id' });
        studentsStore.createIndex('school_id', 'school_id', { unique: false });
        studentsStore.createIndex('status', 'status', { unique: false });
      }

      // ── events ──
      if (!db.objectStoreNames.contains('events')) {
        const eventsStore = db.createObjectStore('events', { keyPath: 'id' });
        eventsStore.createIndex('school_id', 'school_id', { unique: false });
        eventsStore.createIndex('status', 'status', { unique: false });
      }

      // ── attendance ──
      // Uses auto-increment id with a unique compound_key index
      if (!db.objectStoreNames.contains('attendance')) {
        const attStore = db.createObjectStore('attendance', {
          keyPath: 'id',
          autoIncrement: true,
        });
        attStore.createIndex('compound_key', 'compound_key', { unique: true });
        attStore.createIndex('student_id', 'student_id', { unique: false });
        attStore.createIndex('date', 'date', { unique: false });
        attStore.createIndex('status', 'status', { unique: false });
      }

      // ── schools ──
      if (!db.objectStoreNames.contains('schools')) {
        db.createObjectStore('schools', { keyPath: 'id' });
      }

      // ── syncQueue ──
      if (!db.objectStoreNames.contains('syncQueue')) {
        const syncStore = db.createObjectStore('syncQueue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        syncStore.createIndex('type', 'type', { unique: false });
        syncStore.createIndex('status', 'status', { unique: false });
      }

      // ── syncMeta ──
      if (!db.objectStoreNames.contains('syncMeta')) {
        db.createObjectStore('syncMeta', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;

      // If the connection is unexpectedly closed, clear the cached instance
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      // On version change (another tab upgraded), close gracefully
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };

    request.onblocked = () => {
      // Another tab has the DB open – we just wait
      console.warn('[offline-db] Database upgrade blocked by another tab.');
    };
  });
}

/**
 * Initialise (or return the existing) database connection.
 */
export async function initOfflineDB(): Promise<IDBDatabase> {
  return openDB();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Wrap an IDBRequest in a Promise, rejecting on error. */
function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Run a read-write transaction on the given stores and return the request promise. */
async function rwTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  return promisify(work(store));
}

// ---------------------------------------------------------------------------
// saveSyncedData – overwrite local stores with server data
// ---------------------------------------------------------------------------

export async function saveSyncedData(data: {
  students: Record<string, unknown>[];
  events: Record<string, unknown>[];
  attendance: Record<string, unknown>[];
  schools: Record<string, unknown>[];
}): Promise<void> {
  const db = await openDB();

  // We use a single transaction that covers all four stores so the write is atomic.
  const storeNames = ['students', 'events', 'attendance', 'schools'];
  const tx = db.transaction(storeNames, 'readwrite');

  // Clear each store first
  for (const name of storeNames) {
    tx.objectStore(name).clear();
  }

  // Insert students
  const studentsStore = tx.objectStore('students');
  for (const student of data.students) {
    studentsStore.put(student);
  }

  // Insert events
  const eventsStore = tx.objectStore('events');
  for (const event of data.events) {
    eventsStore.put(event);
  }

  // Insert attendance – add compound_key
  const attStore = tx.objectStore('attendance');
  for (const rec of data.attendance) {
    const studentId = (rec as Record<string, unknown>).student_id as string;
    const date = (rec as Record<string, unknown>).date as string;
    attStore.put({
      ...rec,
      compound_key: `${studentId}_${date}`,
    });
  }

  // Insert schools
  const schoolsStore = tx.objectStore('schools');
  for (const school of data.schools) {
    schoolsStore.put(school);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// syncQueue operations
// ---------------------------------------------------------------------------

export async function queueOfflineOperation(op: {
  type: 'attendance' | 'participation';
  data: Record<string, unknown>;
  timestamp: string;
}): Promise<number> {
  const item: Omit<SyncQueueItem, 'id'> = {
    type: op.type,
    data: op.data,
    timestamp: op.timestamp,
    status: 'pending',
  };

  const db = await openDB();
  const tx = db.transaction('syncQueue', 'readwrite');
  const store = tx.objectStore('syncQueue');
  const request = store.add(item);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingOperations(): Promise<SyncQueueItem[]> {
  try {
    const db = await openDB();
    const tx = db.transaction('syncQueue', 'readonly');
    const store = tx.objectStore('syncQueue');
    const index = store.index('status');
    const request = index.getAll('pending');
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result as SyncQueueItem[]);
      request.onerror = () => {
        console.error('[offline-db] getPendingOperations error:', request.error);
        resolve([]);
      };
    });
  } catch (err) {
    console.error('[offline-db] getPendingOperations exception:', err);
    return [];
  }
}

export async function markOperationsSynced(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = await openDB();
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    for (const id of ids) {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (item) {
          item.status = 'synced';
          store.put(item);
        }
      };
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[offline-db] markOperationsSynced exception:', err);
  }
}

export async function markOperationsError(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = await openDB();
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    for (const id of ids) {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (item) {
          item.status = 'error';
          store.put(item);
        }
      };
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[offline-db] markOperationsError exception:', err);
  }
}

// ---------------------------------------------------------------------------
// Local queries
// ---------------------------------------------------------------------------

export async function getLocalStudents(schoolId?: string): Promise<Record<string, unknown>[]> {
  try {
    const db = await openDB();
    const tx = db.transaction('students', 'readonly');
    const store = tx.objectStore('students');

    if (schoolId) {
      const index = store.index('school_id');
      const request = index.getAll(schoolId);
      return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
        request.onerror = () => {
          console.error('[offline-db] getLocalStudents error:', request.error);
          resolve([]);
        };
      });
    }

    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
      request.onerror = () => {
        console.error('[offline-db] getLocalStudents error:', request.error);
        resolve([]);
      };
    });
  } catch (err) {
    console.error('[offline-db] getLocalStudents exception:', err);
    return [];
  }
}

export async function getLocalAttendance(
  studentId?: string,
  date?: string,
): Promise<Record<string, unknown>[]> {
  try {
    const db = await openDB();
    const tx = db.transaction('attendance', 'readonly');
    const store = tx.objectStore('attendance');

    // If both studentId and date are provided, use the compound_key for a direct lookup
    if (studentId && date) {
      const index = store.index('compound_key');
      const request = index.getAll(`${studentId}_${date}`);
      return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
        request.onerror = () => {
          console.error('[offline-db] getLocalAttendance error:', request.error);
          resolve([]);
        };
      });
    }

    if (studentId) {
      const index = store.index('student_id');
      const request = index.getAll(studentId);
      return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
        request.onerror = () => {
          console.error('[offline-db] getLocalAttendance error:', request.error);
          resolve([]);
        };
      });
    }

    if (date) {
      const index = store.index('date');
      const request = index.getAll(date);
      return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
        request.onerror = () => {
          console.error('[offline-db] getLocalAttendance error:', request.error);
          resolve([]);
        };
      });
    }

    // No filters – return all
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
      request.onerror = () => {
        console.error('[offline-db] getLocalAttendance error:', request.error);
        resolve([]);
      };
    });
  } catch (err) {
    console.error('[offline-db] getLocalAttendance exception:', err);
    return [];
  }
}

export async function saveLocalAttendance(record: {
  student_id: string;
  date: string; // YYYY-MM-DD
  status: string; // present | absent | justified_absence
  notes?: string;
  meeting_time?: string;
}): Promise<void> {
  const compoundKey = `${record.student_id}_${record.date}`;
  const entry: AttendanceRecord = {
    student_id: record.student_id,
    date: record.date,
    status: record.status,
    notes: record.notes,
    meeting_time: record.meeting_time,
    compound_key: compoundKey,
  };

  try {
    const db = await openDB();
    const tx = db.transaction('attendance', 'readwrite');
    const store = tx.objectStore('attendance');

    // Use put so that an existing record for the same compound_key is overwritten
    store.put(entry);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[offline-db] saveLocalAttendance exception:', err);
  }
}

export async function getLocalEvents(): Promise<Record<string, unknown>[]> {
  try {
    const db = await openDB();
    return rwTransaction('events', 'readonly', (store) => store.getAll())
      .then((result) => result as Record<string, unknown>[])
      .catch((err) => {
        console.error('[offline-db] getLocalEvents error:', err);
        return [];
      });
  } catch (err) {
    console.error('[offline-db] getLocalEvents exception:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// syncMeta
// ---------------------------------------------------------------------------

export async function getSyncMeta(key: string): Promise<string | null> {
  try {
    const db = await openDB();
    const tx = db.transaction('syncMeta', 'readonly');
    const store = tx.objectStore('syncMeta');
    const request = store.get(key);
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const result = request.result as { key: string; value: string } | undefined;
        resolve(result?.value ?? null);
      };
      request.onerror = () => {
        console.error('[offline-db] getSyncMeta error:', request.error);
        resolve(null);
      };
    });
  } catch (err) {
    console.error('[offline-db] getSyncMeta exception:', err);
    return null;
  }
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('syncMeta', 'readwrite');
    const store = tx.objectStore('syncMeta');
    store.put({ key, value });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[offline-db] setSyncMeta exception:', err);
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export async function clearAllData(): Promise<void> {
  try {
    const db = await openDB();
    const storeNames = Array.from(db.objectStoreNames);
    const tx = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[offline-db] clearAllData exception:', err);
  }
}

export async function getPendingCount(): Promise<number> {
  try {
    const pending = await getPendingOperations();
    return pending.length;
  } catch (err) {
    console.error('[offline-db] getPendingCount exception:', err);
    return 0;
  }
}
