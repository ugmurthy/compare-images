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
const REFERENCES = 'references';

type StoredEntry = Omit<HistoryEntry, 'reference'> & {
  reference: Omit<HistoryEntry['reference'], 'file'>;
  referenceId: string;
};

function openHistory(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 3);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion < 2) {
        if (request.result.objectStoreNames.contains(STORE)) request.result.deleteObjectStore(STORE);
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
      request.result.createObjectStore(REFERENCES);
      request.transaction!.objectStore(STORE).createIndex('referenceId', 'referenceId');
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, references: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openHistory();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE, REFERENCES], mode);
    const request = run(transaction.objectStore(STORE), transaction.objectStore(REFERENCES));
    transaction.oncomplete = () => { db.close(); resolve(request.result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const files = new Map<string, File>();
  const entries = await transact<(HistoryEntry | StoredEntry)[]>('readonly', (store, references) => {
    const keys = references.getAllKeys();
    const values = references.getAll();
    values.onsuccess = () => values.result.forEach((file, index) => files.set(keys.result[index] as string, file));
    return store.getAll();
  });
  const legacy = entries.filter((entry): entry is HistoryEntry => !('referenceId' in entry));
  if (legacy.length) {
    // Hash outside the transaction: awaiting file reads would let IndexedDB close it.
    const prepared = await Promise.all(legacy.map(prepareEntry));
    await transact('readwrite', (store, references) => {
      for (const { entry, file } of prepared) {
        const current = store.get(entry.id);
        current.onsuccess = () => {
          // Another tab may have saved or deleted the entry while we hashed it.
          if (current.result && !('referenceId' in current.result)) {
            references.put(file, entry.referenceId);
            store.put(entry);
          }
        };
      }
      return store.getAll();
    });
    return listHistory();
  }
  return entries.map((entry) => {
    const stored = entry as StoredEntry;
    const file = files.get(stored.referenceId);
    if (!file) throw new Error('Saved reference image is missing.');
    const { referenceId, ...record } = stored;
    return { ...record, reference: { ...record.reference, file: file.name === record.reference.name ? file : new File([file], record.reference.name, { type: file.type, lastModified: file.lastModified }) } };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function prepareEntry(entry: HistoryEntry): Promise<{ entry: StoredEntry; file: File }> {
  const { file, ...reference } = entry.reference;
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const referenceId = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { entry: { ...entry, reference, referenceId }, file };
}

function removeUnusedReference(store: IDBObjectStore, references: IDBObjectStore, referenceId: string) {
  const count = store.index('referenceId').count(referenceId);
  count.onsuccess = () => { if (!count.result) references.delete(referenceId); };
}

export async function saveHistory(entry: HistoryEntry): Promise<IDBValidKey> {
  const prepared = await prepareEntry(entry);
  return transact('readwrite', (store, references) => {
    const previous = store.get(entry.id);
    const existing = references.getKey(prepared.entry.referenceId);
    existing.onsuccess = () => { if (existing.result === undefined) references.put(prepared.file, prepared.entry.referenceId); };
    const saved = store.put(prepared.entry);
    saved.onsuccess = () => {
      const old = previous.result as StoredEntry | undefined;
      if (old?.referenceId && old.referenceId !== prepared.entry.referenceId) removeUnusedReference(store, references, old.referenceId);
    };
    return saved;
  });
}

export function deleteHistory(id: string): Promise<undefined> {
  return transact('readwrite', (store, references) => {
    const previous = store.get(id);
    const deleted = store.delete(id);
    deleted.onsuccess = () => {
      const old = previous.result as StoredEntry | undefined;
      if (old?.referenceId) removeUnusedReference(store, references, old.referenceId);
    };
    return deleted;
  });
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
