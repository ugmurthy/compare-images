import { alignedPng, photoCaptureTime } from './alignedExport';
import type { HistoryEntry } from './history';
import type { GifReply } from './overlayGif';

export async function downloadHistoryGif(
  entries: HistoryEntry[], signal: AbortSignal, onprogress: (message: string) => void
): Promise<string> {
  signal.throwIfAborted();
  if (!entries.length) throw new Error('No saved source images to export.');
  onprogress('Reading photo capture timestamps…');
  const dated: { entry: HistoryEntry; capturedAt: number | null; timestamp: number }[] = [];
  for (const entry of entries) {
    signal.throwIfAborted();
    const capturedAt = await photoCaptureTime(entry.source.file);
    dated.push({ entry, capturedAt, timestamp: capturedAt ?? Date.parse(entry.createdAt) });
  }
  dated.sort((a, b) => a.timestamp - b.timestamp || a.entry.id.localeCompare(b.entry.id));
  // Browsers clamp GIF delays below 20 ms. Sample long histories across the full timeline.
  const selected = dated.length <= 100 ? dated : Array.from({ length: 100 }, (_, i) => dated[Math.round(i * (dated.length - 1) / 99)]);
  const frames: Blob[] = [];
  for (const [index, { entry }] of selected.entries()) {
    signal.throwIfAborted();
    onprogress(`Aligning GIF image ${index + 1} of ${selected.length}…`);
    await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    signal.throwIfAborted();
    try { frames.push(await alignedPng(entry, 640)); }
    catch (cause) { throw new Error(`Could not export ${entry.source.name}: ${(cause as Error).message}`); }
  }
  signal.throwIfAborted();
  const worker = new Worker(new URL('./historyGif.worker.ts', import.meta.url), { type: 'module' });
  let blob: Blob;
  try {
    blob = await new Promise<Blob>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      const cleanup = () => signal.removeEventListener('abort', abort);
      worker.onerror = () => { cleanup(); reject(new Error('The GIF encoder could not run. Please try again.')); };
      worker.onmessage = ({ data }: MessageEvent<GifReply>) => {
        if ('progress' in data) onprogress(data.progress);
        else {
          cleanup();
          if ('error' in data) reject(new Error(data.error));
          else resolve(new Blob([data.bytes], { type: 'image/gif' }));
        }
      };
      worker.postMessage({ frames });
    });
  } finally { worker.terminate(); }
  signal.throwIfAborted();
  const filename = `${entries[0].projectName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || 'project'}-progress.gif`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const undated = selected.filter((item) => item.capturedAt === null).length;
  return `Download started: ${filename} (${(blob.size / 1_000_000).toFixed(2)} MB). ${selected.length} aligned images, oldest to newest, 2-second loop.` +
    (dated.length > 100 ? ` Evenly sampled from ${dated.length} comparisons, including the oldest and newest.` : '') +
    (undated ? ` Used save dates for ${undated} ${undated === 1 ? 'image' : 'images'} without capture timestamps.` : '');
}
