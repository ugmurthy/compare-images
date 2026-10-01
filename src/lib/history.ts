import type { Region } from './region';

export interface SavedPart {
  id: string;
  name: string;
  note: string;
  region: Region;
  thumbnail: string;
}

export interface HistoryEntry {
  id: string;
  version: 2;
  projectName: string;
  reference: { name: string; width: number; height: number; file: File; thumbnail: string };
  source: { name: string; width: number; height: number; rotations: number; file: File; thumbnail: string };
  createdAt: string;
  note: string;
  alignment: { method: 'manual' | 'auto'; homography: number[]; inlierCount: number };
  parts: SavedPart[];
}

const DATABASE = 'compare-sketch-history';
const STORE = 'entries';

function openHistory(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      if (request.result.objectStoreNames.contains(STORE)) request.result.deleteObjectStore(STORE);
      request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
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

export function thumbnail(image: HTMLImageElement, region?: Region): string {
  const { x, y, width, height } = region ?? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  const scale = Math.min(1, 240 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d')!.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export function storageLevel(ratio: number): 'ok' | 'warning' | 'critical' {
  return ratio >= 0.8 ? 'critical' : ratio >= 0.6 ? 'warning' : 'ok';
}

export async function exportHistory(): Promise<void> {
  const entries = await listHistory();
  const encode = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const records = [];
  for (const entry of entries) {
    records.push({ ...entry,
      reference: { ...entry.reference, file: await encode(entry.reference.file) },
      source: { ...entry.source, file: await encode(entry.source.file) }
    });
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 2, entries: records })], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `compare-sketch-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
