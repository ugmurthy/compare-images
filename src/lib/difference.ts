interface DifferenceResponse {
  output?: ArrayBuffer;
  width?: number;
  height?: number;
  error?: string;
}

/** Compute a denoised binary difference off the UI thread. */
export function computeDifference(
  reference: ImageData,
  aligned: ImageData,
  intensityThreshold = 30,
  minRegionArea = 20
): Promise<ImageData> {
  if (reference.width !== aligned.width || reference.height !== aligned.height) {
    return Promise.reject(new Error('Aligned and reference images must have matching dimensions'));
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./difference.worker.ts', import.meta.url), { type: 'module' });
    const referenceCopy = reference.data.slice().buffer;
    const alignedCopy = aligned.data.slice().buffer;

    worker.onmessage = (event: MessageEvent<DifferenceResponse>) => {
      worker.terminate();
      if (event.data.error || !event.data.output || !event.data.width || !event.data.height) {
        reject(new Error(event.data.error || 'Difference worker returned an invalid result'));
        return;
      }
      resolve(new ImageData(new Uint8ClampedArray(event.data.output), event.data.width, event.data.height));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Difference worker failed'));
    };
    worker.postMessage({
      reference: referenceCopy,
      aligned: alignedCopy,
      width: reference.width,
      height: reference.height,
      intensityThreshold,
      minRegionArea
    }, [referenceCopy, alignedCopy]);
  });
}
