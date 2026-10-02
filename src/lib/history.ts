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

export interface ImportSummary {
  imported: { projects: number; entries: number; parts: number };
  skipped: { projects: number; entries: number; parts: number };
}

export async function importHistory(file: File): Promise<ImportSummary> {
  const data = JSON.parse(await file.text());
  const text = (value: unknown): value is string => typeof value === 'string';
  const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  const positive = (value: unknown) => number(value) && value > 0;
  const image = (value: any) => value && text(value.name) && positive(value.width) && positive(value.height)
    && text(value.thumbnail) && text(value.file);
  const part = (value: any) => value && text(value.id) && !!value.id && text(value.name) && text(value.note)
    && text(value.thumbnail) && value.region && number(value.region.x) && number(value.region.y)
    && positive(value.region.width) && positive(value.region.height);
  if (data?.version !== 2 || !Array.isArray(data.entries)) throw new Error('Choose a version 2 Compare Sketch JSON backup.');
  // Validate and decode the entire backup before making any changes.
  const decode = (value: string, name: string): File => {
    const match = /^data:([^;,]*);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
    if (!match || !match[2]) throw new Error('Backup contains an invalid image data URL.');
    const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
    return new File([bytes], name, { type: match[1] });
  };
  const prepared: { entry: StoredEntry; file: File }[] = [];
  for (const record of data.entries) {
    if (!record || record.version !== 2 || !text(record.id) || !record.id || !text(record.projectName)
      || !record.projectName.trim() || !text(record.createdAt) || !Number.isFinite(Date.parse(record.createdAt))
      || !text(record.note) || !image(record.reference) || !image(record.source)
      || !Number.isInteger(record.source.rotations) || record.source.rotations < 0 || record.source.rotations > 3
      || !record.alignment || !['manual', 'auto'].includes(record.alignment.method)
      || !Array.isArray(record.alignment.homography) || record.alignment.homography.length !== 9
      || !record.alignment.homography.every(number) || !number(record.alignment.inlierCount)
      || !Array.isArray(record.parts) || !record.parts.every(part)) throw new Error('Backup contains an invalid history entry.');
    const entry: HistoryEntry = {
      id: record.id, version: 2, projectName: record.projectName, createdAt: record.createdAt, note: record.note,
      reference: { name: record.reference.name, width: record.reference.width, height: record.reference.height,
        thumbnail: record.reference.thumbnail, file: decode(record.reference.file, record.reference.name) },
      source: { name: record.source.name, width: record.source.width, height: record.source.height,
        rotations: record.source.rotations, thumbnail: record.source.thumbnail, file: decode(record.source.file, record.source.name) },
      alignment: { method: record.alignment.method, homography: record.alignment.homography, inlierCount: record.alignment.inlierCount },
      parts: record.parts.map((item: SavedPart) => ({ id: item.id, name: item.name, note: item.note, thumbnail: item.thumbnail,
        region: { x: item.region.x, y: item.region.y, width: item.region.width, height: item.region.height } }))
    };
    prepared.push(await prepareEntry(entry));
  }
  const summary: ImportSummary = {
    imported: { projects: 0, entries: 0, parts: 0 }, skipped: { projects: 0, entries: 0, parts: 0 }
  };
  await transact('readwrite', (store, references) => {
    const all = store.getAll();
    all.onsuccess = () => {
      const entries = new Map<string, HistoryEntry | StoredEntry>(all.result.map((entry) => [entry.id, entry]));
      const projectKey = (entry: HistoryEntry | StoredEntry) => JSON.stringify([entry.projectName, entry.reference.name]);
      const projects = new Set(all.result.map(projectKey));
      const seenProjects = new Set<string>();
      for (const { entry, file } of prepared) {
        const existing = entries.get(entry.id);
        const key = projectKey(existing ?? entry);
        if (!seenProjects.has(key)) {
          summary[projects.has(key) ? 'skipped' : 'imported'].projects++;
          seenProjects.add(key);
          projects.add(key);
        }
        summary[existing ? 'skipped' : 'imported'].entries++;
        const parts = existing ? [...existing.parts] : [];
        const ids = new Set(parts.map((part) => part.id));
        for (const part of entry.parts) {
          if (ids.has(part.id)) summary.skipped.parts++;
          else { parts.push(part); ids.add(part.id); summary.imported.parts++; }
        }
        // Existing entry metadata and parts always win, even across concurrent imports.
        const merged = { ...(existing ?? entry), parts };
        if (!existing) {
          const reference = references.getKey(entry.referenceId);
          reference.onsuccess = () => { if (reference.result === undefined) references.put(file, entry.referenceId); };
        }
        if (!existing || parts.length !== existing.parts.length) store.put(merged);
        entries.set(entry.id, merged);
      }
    };
    return all;
  });
  return summary;
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
