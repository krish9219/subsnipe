import type { Decision, Transaction } from './model';

export type SavedFile = {
  id: string;
  name: string;
  formatName: string | null;
  count: number;
};

export type SavedWorkspace = {
  version: 1;
  savedAt: string;
  transactions: Transaction[];
  files: SavedFile[];
  decisions: Record<string, Decision>;
  promoted?: string[];
};

const DB_NAME = 'subsnipe';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open storage'));
  });
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not read storage'));
    tx.oncomplete = () => db.close();
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not write storage'));
  });
  db.close();
}

export async function idbClear(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not clear storage'));
  });
  db.close();
}

export async function databaseExists(): Promise<boolean> {
  if (typeof indexedDB === 'undefined' || !indexedDB.databases) return false;
  const databases = await indexedDB.databases();
  return databases.some((database) => database.name === DB_NAME);
}

export async function idbDelete(): Promise<void> {
  if (!(await databaseExists())) return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Could not delete storage'));
    request.onblocked = () => reject(new Error('Storage is still open in another tab'));
  });
}

export const WORKSPACE_KEY = 'workspace';

export function toSaved(input: Omit<SavedWorkspace, 'version' | 'savedAt'>): SavedWorkspace {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    transactions: input.transactions,
    files: input.files,
    decisions: input.decisions,
    promoted: input.promoted ?? [],
  };
}
