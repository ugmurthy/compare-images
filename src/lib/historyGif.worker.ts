/// <reference lib="webworker" />
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { GifReply } from './overlayGif';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const send = (message: GifReply, transfer: Transferable[] = []) => scope.postMessage(message, transfer);

scope.onmessage = async ({ data }: MessageEvent<{ frames: Blob[] }>) => {
  try {
    // Retain compressed frames, decoding one at a time to bound pixel memory.
    for (const maxEdge of [640, 480, 360, 240, 160]) {
      const gif = GIFEncoder();
      let width = 0;
      let height = 0;
      for (const [index, frame] of data.frames.entries()) {
        const bitmap = await createImageBitmap(frame);
        try {
          if (index === 0) {
            const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
            width = Math.max(1, Math.round(bitmap.width * scale));
            height = Math.max(1, Math.round(bitmap.height * scale));
          }
          const canvas = new OffscreenCanvas(width, height);
          const context = canvas.getContext('2d', { willReadFrequently: true })!;
          // GIF has no partial alpha. White also clears each previous drawing and alignment border.
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, width, height);
          context.drawImage(bitmap, 0, 0, width, height);
          const pixels = context.getImageData(0, 0, width, height).data;
          const palette = quantize(pixels, 128, { format: 'rgb444' });
          // Distribute rounding in centiseconds so even 3 or 99 frames total exactly 2 seconds.
          const delay = (Math.round((index + 1) * 200 / data.frames.length) - Math.round(index * 200 / data.frames.length)) * 10;
          gif.writeFrame(applyPalette(pixels, palette, 'rgb444'), width, height, { palette, delay, repeat: 0 });
          send({ progress: `Creating GIF… ${Math.round((index + 1) / data.frames.length * 100)}% (${width} × ${height})` });
        } finally { bitmap.close(); }
      }
      gif.finish();
      const bytes = gif.bytes();
      if (bytes.byteLength <= 4_000_000) {
        send({ bytes: bytes.buffer }, [bytes.buffer]);
        return;
      }
      send({ progress: 'Reducing GIF dimensions to stay under 4 MB…' });
    }
    throw new Error('Could not fit the animation within 4 MB.');
  } catch (cause) { send({ error: (cause as Error).message }); }
};
