/// <reference lib="webworker" />
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { OVERLAY_DURATION, overlayOpacityAt } from './overlayAnimation';
import type { GifReply } from './overlayGif';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const FRAME_COUNT = 20;
const MAX_BYTES = 4_000_000;
const send = (message: GifReply, transfer: Transferable[] = []) => scope.postMessage(message, transfer);

scope.onmessage = ({ data }: MessageEvent<{ reference: ImageBitmap; source: ImageBitmap }>) => {
  const { reference, source } = data;
  try {
    // Retry at smaller sizes only when the actual compressed GIF exceeds the budget.
    for (const maxEdge of [640, 480, 360]) {
      const scale = Math.min(1, maxEdge / Math.max(reference.width, reference.height));
      const width = Math.max(1, Math.round(reference.width * scale));
      const height = Math.max(1, Math.round(reference.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      const gif = GIFEncoder();
      for (let frame = 0; frame < FRAME_COUNT; frame++) {
        context.globalAlpha = 1;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(reference, 0, 0, width, height);
        context.globalAlpha = overlayOpacityAt(frame * OVERLAY_DURATION / FRAME_COUNT);
        context.drawImage(source, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        const palette = quantize(pixels, 128, { format: 'rgb444' });
        gif.writeFrame(applyPalette(pixels, palette, 'rgb444'), width, height, {
          palette, delay: OVERLAY_DURATION / FRAME_COUNT, repeat: 0
        });
        send({ progress: `Creating GIF… ${Math.round((frame + 1) / FRAME_COUNT * 100)}% (${width} × ${height})` });
      }
      gif.finish();
      const bytes = gif.bytes();
      if (bytes.byteLength <= MAX_BYTES) {
        send({ bytes: bytes.buffer }, [bytes.buffer]);
        return;
      }
      send({ progress: 'Reducing GIF dimensions to stay under 4 MB…' });
    }
    throw new Error('Could not fit the animation within 4 MB. Try selecting a smaller part.');
  } catch (cause) {
    send({ error: (cause as Error).message });
  } finally {
    reference.close();
    source.close();
  }
};
