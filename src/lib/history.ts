import type { Region } from './region';

export interface SavedPart {
  id: string;
  name: string;
  note: string;
  region: Region;
}

export interface HistoryEntry {
  id: string;
  version: 1;
  projectName: string;
  reference: { name: string; width: number; height: number };
  source: { name: string; width: number; height: number; rotations: number };
  createdAt: string;
  note: string;
  alignment: { method: 'manual' | 'auto'; homography: number[]; inlierCount: number };
  parts: SavedPart[];
}

const DATABASE = 'compare-sketch-history';
const STORE = 'entries';

function openHistory(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openHistory();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    transaction.oncomplete = () => { db.close(); resolve(request.result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const entries = await transact<HistoryEntry[]>('readonly', (store) => store.getAll());
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveHistory(entry: HistoryEntry): Promise<IDBValidKey> {
  return transact('readwrite', (store) => store.put(entry));
}

export function deleteHistory(id: string): Promise<undefined> {
  return transact('readwrite', (store) => store.delete(id));
}
