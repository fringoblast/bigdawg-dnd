// Persistence backend: IndexedDB (device-backed, effectively unlimited) with a
// lazy one-time migration from the old localStorage keys, so existing saves are
// never orphaned. All zustand stores route here via `idbStorage`.

const DB_NAME = 'bigdawg-dnd';
const DB_VERSION = 1;
const STORE = 'kv';
const LEGACY_PREFIX = 'bd-';

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
  return dbPromise;
};

const tx = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IDB operation failed'));
  });
};

const migrateFromLocalStorage = (key: string): void => {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return;
    // Async fire-and-forget copy; then remove the legacy copy so old 5MB cap
    // pressure and future double-writes disappear.
    tx('readwrite', s => s.put(raw, key)).then(() => {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }).catch(() => { /* leave localStorage in place if IDB write failed */ });
  } catch { /* ignore */ }
};

const idbGet = async (key: string): Promise<string | null> => {
  try {
    const v = await tx('readonly', s => s.get(key));
    if (v != null) return v as string;
  } catch { /* fall through to legacy */ }
  if (key.startsWith(LEGACY_PREFIX)) {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        migrateFromLocalStorage(key);
        return raw;
      }
    } catch { /* ignore */ }
  }
  return null;
};

const idbSet = async (key: string, value: string): Promise<void> => {
  await tx('readwrite', s => s.put(value, key));
};

const idbRemove = async (key: string): Promise<void> => {
  try {
    await tx('readwrite', s => s.delete(key));
  } catch { /* ignore */ }
};

const idbKeys = async (): Promise<string[]> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve((req.result as (string | number | Date | ArrayBuffer)[]).map(String));
    req.onerror = () => reject(req.error || new Error('IDB keys failed'));
  });
};

const idbClear = async (): Promise<void> => {
  try {
    await tx('readwrite', s => s.clear());
  } catch { /* ignore */ }
};

export const idbStorage = {
  getItem: (key: string): Promise<string | null> => idbGet(key),
  setItem: (key: string, value: string): Promise<void> => idbSet(key, value),
  removeItem: (key: string): Promise<void> => idbRemove(key)
};

/** Wipe everything (IndexedDB + any leftover legacy localStorage), used by Settings > reset. */
export const clearAllData = async (): Promise<void> => {
  await idbClear();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY_PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
};

// Kept for compatibility with the old sync API callers (SettingsModal usage meter).
export const storage = {
  estimateUsage: async (): Promise<{ used: number; total: number; pct: number }> => {
    let used = 0;
    try {
      const keys = await idbKeys();
      for (const k of keys) {
        const v = await idbGet(k);
        if (v != null) used += k.length + v.length;
      }
    } catch { /* ignore */ }
    const total = 2048 * 1024 * 1024; // device-backed: report 2 GB ceiling
    return { used: used * 2, total, pct: used * 2 / total };
  }
};

export const uid = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
};
