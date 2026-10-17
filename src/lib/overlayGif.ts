import type { Region } from './region';

export type GifReply = { progress: string } | { bytes: ArrayBuffer } | { error: string };

// Snapshot only the displayed image area, never UI controls or screen-sized letterboxing.
export async function overlayGif(
  reference: HTMLImageElement,
  source: HTMLImageElement | ImageData,
  region: Region | undefined,
  signal: AbortSignal,
  onprogress: (message: string) => void
): Promise<Blob> {
  const { x, y, width, height } = region ?? { x: 0, y: 0, width: reference.naturalWidth, height: reference.naturalHeight };
  const scale = Math.min(1, 640 / Math.max(width, height));
  const options: ImageBitmapOptions = {
    resizeWidth: Math.max(1, Math.round(width * scale)),
    resizeHeight: Math.max(1, Math.round(height * scale)),
    resizeQuality: 'high'
  };
  let refBitmap: ImageBitmap | undefined;
  let srcBitmap: ImageBitmap | undefined;
  try {
    signal.throwIfAborted();
    refBitmap = await createImageBitmap(reference, x, y, width, height, options);
    signal.throwIfAborted();
    srcBitmap = await createImageBitmap(source, x, y, width, height, options);
    signal.throwIfAborted();
    const worker = new Worker(new URL('./overlayGif.worker.ts', import.meta.url), { type: 'module' });
    try {
      return await new Promise<Blob>((resolve, reject) => {
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
        worker.postMessage({ reference: refBitmap, source: srcBitmap }, [refBitmap!, srcBitmap!]);
      });
    } finally { worker.terminate(); }
  } finally {
    refBitmap?.close();
    srcBitmap?.close();
  }
}
