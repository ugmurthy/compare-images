import { parse } from 'exifr';
import { AsyncZipDeflate, Zip } from 'fflate';
import type { HistoryEntry } from './history';
import { restoreAlignment } from './opencv';

export async function photoCaptureTime(file: File): Promise<number | null> {
  try {
    const tags = await parse(file, {
      pick: ['DateTimeOriginal', 'OffsetTimeOriginal', 'SubSecTimeOriginal'],
      reviveValues: false
    });
    const date = tags?.DateTimeOriginal;
    if (typeof date !== 'string' || !/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(date)) return null;
    const [year, month, day, hour, minute, second] = date.split(/[: ]/).map(Number);
    const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day ||
      check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second) return null;
    const offset = tags.OffsetTimeOriginal ?? '';
    if (typeof offset !== 'string' || (offset && !/^[+-]\d{2}:\d{2}$/.test(offset))) return null;
    const subsecond = typeof tags.SubSecTimeOriginal === 'string' && /^\d+$/.test(tags.SubSecTimeOriginal)
      ? `.${tags.SubSecTimeOriginal.slice(0, 3)}` : '';
    // Without an EXIF offset, interpret the camera's clock in the browser's local timezone.
    const timestamp = Date.parse(`${date.slice(0, 10).replaceAll(':', '-')}T${date.slice(11)}${subsecond}${offset}`);
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    // Screenshots, edited photos, and some formats have no readable capture metadata.
    return null;
  }
}

function safeName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || 'image';
}

export async function prepareAlignedExport(entries: HistoryEntry[]) {
  const dated = [];
  for (const entry of entries) dated.push({ entry, capturedAt: await photoCaptureTime(entry.source.file) });
  dated.sort((a, b) => (b.capturedAt ?? -Infinity) - (a.capturedAt ?? -Infinity) ||
    a.entry.source.name.localeCompare(b.entry.source.name) || a.entry.id.localeCompare(b.entry.id));
  const selected = dated.slice(0, 99);
  return {
    images: selected.map(({ entry }, index) => ({
      entry, filename: `${safeName(entry.projectName)}_${String(index + 1).padStart(2, '0')}.png`
    })),
    undated: selected.filter((item) => item.capturedAt === null).length,
    ignored: Math.max(0, entries.length - 99)
  };
}

async function alignedPng(entry: HistoryEntry): Promise<Blob> {
  const url = URL.createObjectURL(entry.source.file);
  const canvas = document.createElement('canvas');
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const turns = entry.source.rotations;
    canvas.width = turns % 2 ? image.naturalHeight : image.naturalWidth;
    canvas.height = turns % 2 ? image.naturalWidth : image.naturalHeight;
    if (canvas.width !== entry.source.width || canvas.height !== entry.source.height) {
      throw new Error('Saved source dimensions differ from the image.');
    }
    const context = canvas.getContext('2d')!;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(turns * Math.PI / 2);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    const source = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = await restoreAlignment(entry.reference, source, entry.alignment);
    canvas.width = result.aligned.width;
    canvas.height = result.aligned.height;
    canvas.getContext('2d')!.putImageData(result.aligned, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode aligned image.')), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}

export async function downloadAlignedSources(entries: HistoryEntry[], onprogress: (message: string) => void): Promise<string> {
  if (!entries.length) throw new Error('No saved source images to export.');
  onprogress('Reading photo capture timestamps…');
  const plan = await prepareAlignedExport(entries);
  const chunks: ArrayBuffer[] = [];
  let zipError: Error | null = null;
  const archive = new Zip((error, data) => {
    if (error) zipError = error;
    else chunks.push(data.slice().buffer);
  });
  try {
    for (const [index, { entry, filename }] of plan.images.entries()) {
      onprogress(`Aligning and compressing ${index + 1} of ${plan.images.length}…`);
      // Yield before OpenCV's synchronous work so progress can paint.
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      try {
        const png = await alignedPng(entry);
        const stream = new AsyncZipDeflate(filename, { level: 6 });
        archive.add(stream);
        try {
          const bytes = new Uint8Array(await png.arrayBuffer());
          await new Promise<void>((resolve, reject) => {
            const forward = stream.ondata;
            stream.ondata = (error, data, final) => {
              forward(error, data, final);
              if (error || zipError) reject(error || zipError);
              else if (final) resolve();
            };
            stream.push(bytes, true);
          });
        } finally { stream.terminate(); }
      } catch (cause) {
        throw new Error(`Could not export ${entry.source.name}: ${(cause as Error).message}`);
      }
    }
    archive.end();
    if (zipError) throw zipError;
    const url = URL.createObjectURL(new Blob(chunks, { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeName(entries[0].projectName)}-aligned-sources.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return `Download started: ${plan.images.length} aligned ${plan.images.length === 1 ? 'image' : 'images'}.` +
      (plan.ignored ? ` ${plan.ignored} ${plan.ignored === 1 ? 'entry' : 'entries'} beyond the 99-image limit ${plan.ignored === 1 ? 'was' : 'were'} ignored.` : '') +
      (plan.undated ? ` ${plan.undated} ${plan.undated === 1 ? 'photo had' : 'photos had'} no readable capture timestamp and ${plan.undated === 1 ? 'was' : 'were'} placed last (filename order).` : '');
  } finally { archive.terminate(); }
}
