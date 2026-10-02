import { deleteHistory, exportHistory, importHistory, listHistory, saveHistory, type HistoryEntry } from '../src/lib/history';

// Run in a disposable browser session against Vite:
// await (await import('/tests/history.browser.ts')).testHistoryStorage()
// This test replaces that session's history database, never a real user's data.
export async function testHistoryStorage(): Promise<string> {
  const database = 'compare-sketch-history';
  function check(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
  }
  function request<T>(value: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      value.onsuccess = () => resolve(value.result);
      value.onerror = () => reject(value.error);
    });
  }
  function complete(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
  }
  const reference = new File(['reference A'], 'same.png', { type: 'image/png' });
  const differentReference = new File(['reference B'], 'same.png', { type: 'image/png' });
  function entry(id: string, file = reference): HistoryEntry {
    return {
      id, version: 2, projectName: 'Study', createdAt: `2026-10-0${id}T12:00:00Z`, note: `Note ${id}`,
      reference: { name: file.name, width: 320, height: 240, file, thumbnail: 'reference thumbnail' },
      source: { name: `source-${id}.png`, width: 320, height: 240, rotations: 1,
        file: new File([`source ${id}`], `source-${id}.png`, { type: 'image/png' }), thumbnail: `source thumbnail ${id}` },
      alignment: { method: 'manual', homography: [1, 0, 2, 0, 1, 3, 0, 0, 1], inlierCount: 4 },
      parts: [{ id: 'part', name: 'Detail', note: 'Part note', region: { x: 2, y: 3, width: 40, height: 50 }, thumbnail: 'part thumbnail' }]
    };
  }
  await request(indexedDB.deleteDatabase(database));
  const opening = indexedDB.open(database, 2);
  opening.onupgradeneeded = () => opening.result.createObjectStore('entries', { keyPath: 'id' });
  const old = await request(opening);
  const seed = old.transaction('entries', 'readwrite');
  const seeded = complete(seed);
  for (const record of [entry('1'), entry('2'), entry('3', differentReference)]) seed.objectStore('entries').put(record);
  await seeded;
  old.close();

  async function inspect(expectedEntries: number, expectedReferences: number) {
    const db = await request(indexedDB.open(database));
    try {
      check(db.version === 3, 'Database upgraded to version 3');
      const tx = db.transaction(['entries', 'references']);
      const done = complete(tx);
      const records = request(tx.objectStore('entries').getAll());
      const count = request(tx.objectStore('references').count());
      const [stored, references] = await Promise.all([records, count]);
      await done;
      check(stored.length === expectedEntries && references === expectedReferences, `Expected ${expectedEntries} entries / ${expectedReferences} references, got ${stored.length} / ${references}`);
      check(stored.every((record) => !('file' in record.reference) && record.referenceId && record.source.file instanceof File), 'Only reference files moved out of entries');
    } finally { db.close(); }
  }

  let restored = await listHistory();
  await inspect(3, 2);
  check(restored.map((record) => record.id).join(',') === '3,2,1', 'Timestamp sorting preserved');
  for (const record of restored) {
    check(await record.reference.file.text() === (record.id === '3' ? 'reference B' : 'reference A'), 'Same filename does not merge different contents');
    check(await record.source.file.text() === `source ${record.id}`, 'Source contents preserved');
    check(record.source.rotations === 1 && record.note === `Note ${record.id}` && record.parts[0].note === 'Part note' && record.alignment.homography[2] === 2, 'Migration preserves comparison metadata');
  }
  const renamed = entry('4', new File(['reference A'], 'renamed.png', { type: 'image/png' }));
  await Promise.all([saveHistory(renamed), saveHistory(entry('5'))]);
  await inspect(5, 2);
  const updated = { ...renamed, note: 'Updated note', parts: [] };
  await saveHistory(updated);
  await inspect(5, 2);
  restored = await listHistory();
  check(restored.find((record) => record.id === '4')?.reference.file.name === 'renamed.png', 'Reference filename preserved after deduplication');
  check(restored.find((record) => record.id === '4')?.note === 'Updated note', 'Entry updates preserved');

  // Capture the download without depending on browser download configuration.
  const createURL = URL.createObjectURL;
  const click = HTMLAnchorElement.prototype.click;
  let exported: Blob | undefined;
  URL.createObjectURL = (blob) => { exported = blob as Blob; return createURL(blob); };
  HTMLAnchorElement.prototype.click = () => {};
  try {
    await exportHistory();
    const data = JSON.parse(await exported!.text());
    check(data.version === 2 && data.entries.length === 5, 'Export format unchanged');
    check(data.entries.every((record: any) => record.reference.file.startsWith('data:image/png;base64,') && record.source.file.startsWith('data:image/png;base64,') && !('referenceId' in record)), 'Export includes both files, not internal storage pointers');
  } finally {
    URL.createObjectURL = createURL;
    HTMLAnchorElement.prototype.click = click;
  }

  await deleteHistory('1');
  await deleteHistory('2');
  await inspect(3, 2);
  await deleteHistory('5');
  await inspect(2, 2);
  check(await (await listHistory()).find((record) => record.id === '4')!.reference.file.text() === 'reference A', 'Deleting siblings retains the shared reference');
  await saveHistory({ ...updated, reference: entry('3', differentReference).reference });
  await inspect(2, 1);
  await deleteHistory('3');
  await inspect(1, 1);
  await deleteHistory('4');
  await inspect(0, 0);

  // Simulate another tab deleting/saving legacy entries during migration's file read.
  const db = await request(indexedDB.open(database));
  const tx = db.transaction('entries', 'readwrite');
  const done = complete(tx);
  const raceFile = new File(['legacy reference'], 'race.png', { type: 'image/png' });
  tx.objectStore('entries').put(entry('6', raceFile));
  tx.objectStore('entries').put(entry('7', raceFile));
  await done;
  db.close();
  const arrayBuffer = File.prototype.arrayBuffer;
  let unblock!: () => void;
  let entered!: () => void;
  const paused = new Promise<void>((resolve) => entered = resolve);
  const gate = new Promise<void>((resolve) => unblock = resolve);
  File.prototype.arrayBuffer = async function () {
    if (this.name === 'race.png') { entered(); await gate; }
    return arrayBuffer.call(this);
  };
  try {
    const migrating = listHistory();
    await paused;
    await deleteHistory('6');
    await saveHistory({ ...entry('7'), note: 'Saved during migration' });
    unblock();
    const records = await migrating;
    check(records.length === 1 && records[0].id === '7' && records[0].note === 'Saved during migration', 'Migration does not resurrect deleted entries or overwrite newer saves');
    await inspect(1, 1);
  } finally {
    unblock();
    File.prototype.arrayBuffer = arrayBuffer;
  }
  await deleteHistory('7');
  await inspect(0, 0);

  // Import the actual export, then change local records before importing it again.
  await importHistory(new File([await exported!.text()], 'backup.json'));
  await inspect(5, 2);
  restored = await listHistory();
  check(await restored.find((record) => record.id === '3')!.reference.file.text() === 'reference B', 'Import restores distinct reference bytes');
  check(await restored.find((record) => record.id === '2')!.source.file.text() === 'source 2', 'Import restores source bytes');
  const local = restored.find((record) => record.id === '1')!;
  await saveHistory({ ...local, note: 'Keep local note', parts: [{ ...local.parts[0], note: 'Keep local part' }] });
  await deleteHistory('2');
  await deleteHistory('4');
  const backup = JSON.parse(await exported!.text());
  const incoming = backup.entries.find((record: HistoryEntry) => record.id === '1');
  incoming.projectName = 'Do not rename local project';
  incoming.parts.push({ ...incoming.parts[0], id: 'new-part', note: 'Imported part' });
  const fresh = { ...backup.entries.find((record: HistoryEntry) => record.id === '3'), id: '8', projectName: 'New project' };
  const input = new File([JSON.stringify({ version: 2, entries: [...backup.entries, fresh, fresh] })], 'backup.json');
  const summary = await importHistory(input);
  // Removing entry 4 also removed the only project using renamed.png.
  check(JSON.stringify(summary) === JSON.stringify({ imported: { projects: 2, entries: 3, parts: 3 }, skipped: { projects: 1, entries: 4, parts: 4 } }), `Import counts new projects, entries and parts, including duplicate IDs: ${JSON.stringify(summary)}`);
  await inspect(6, 2);
  const kept = (await listHistory()).find((record) => record.id === '1')!;
  check(kept.projectName === 'Study' && kept.note === 'Keep local note' && kept.parts[0].note === 'Keep local part'
    && kept.parts.length === 2 && kept.parts[1].note === 'Imported part', 'Import keeps local metadata and parts while appending missing parts');
  const repeats = await Promise.all([importHistory(input), importHistory(input)]);
  check(repeats.every((result) => result.imported.projects === 0 && result.imported.entries === 0 && result.imported.parts === 0), 'Repeated concurrent imports are idempotent');
  const concurrent = new File([JSON.stringify({ version: 2, entries: [{ ...fresh, id: '9', projectName: 'Concurrent' }] })], 'concurrent.json');
  const races = await Promise.all([importHistory(concurrent), importHistory(concurrent)]);
  check(races.reduce((total, result) => total + result.imported.entries, 0) === 1
    && races.reduce((total, result) => total + result.imported.parts, 0) === 1, 'Concurrent new imports insert exactly once');
  for (const invalid of ['{', JSON.stringify({ version: 1, entries: [] }), JSON.stringify({ version: 2, entries: [
    { ...fresh, id: 'must-not-save' }, { ...fresh, id: 'bad', source: { ...fresh.source, file: 'https://example.com/image.png' } }
  ] }), JSON.stringify({ version: 2, entries: [{ ...fresh, alignment: { ...fresh.alignment, homography: [1] } }] })]) {
    let rejected = false;
    try { await importHistory(new File([invalid], 'invalid.json')); }
    catch { rejected = true; }
    check(rejected, 'Invalid backup is rejected');
    await inspect(7, 2);
  }
  for (const record of await listHistory()) await deleteHistory(record.id);
  await inspect(0, 0);
  return 'PASS: migration, reference deduplication, export/import round-trip, non-overwriting entry/part merges, summary counts, repeated/concurrent imports, invalid-backup atomicity, and reference cleanup';
}
