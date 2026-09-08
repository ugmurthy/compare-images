interface DifferenceRequest {
  reference: ArrayBuffer;
  aligned: ArrayBuffer;
  width: number;
  height: number;
  intensityThreshold: number;
  minRegionArea: number;
}

function grayscaleBlur(rgba: Uint8ClampedArray, width: number, height: number) {
  const pixelCount = width * height;
  const gray = new Uint8Array(pixelCount);
  const horizontal = new Uint16Array(pixelCount);
  const blurred = new Uint8Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    gray[i] = Math.round(rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114);
  }

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const index = row + x;
      horizontal[index] = gray[row + Math.max(0, x - 1)] + 2 * gray[index] + gray[row + Math.min(width - 1, x + 1)];
    }
  }

  for (let y = 0; y < height; y++) {
    const previousRow = Math.max(0, y - 1) * width;
    const row = y * width;
    const nextRow = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x++) {
      blurred[row + x] = (horizontal[previousRow + x] + 2 * horizontal[row + x] + horizontal[nextRow + x] + 8) >> 4;
    }
  }

  return blurred;
}

function removeSmallRegions(binary: Uint8Array, width: number, height: number, minArea: number) {
  if (minArea <= 1) return;

  const queue = new Int32Array(width * height);
  for (let start = 0; start < binary.length; start++) {
    if (binary[start] !== 255) continue;

    let head = 0;
    let tail = 1;
    queue[0] = start;
    binary[start] = 128;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;

      if (index >= width && binary[index - width] === 255) {
        binary[index - width] = 128;
        queue[tail++] = index - width;
      }
      if (index < binary.length - width && binary[index + width] === 255) {
        binary[index + width] = 128;
        queue[tail++] = index + width;
      }
      if (x > 0 && binary[index - 1] === 255) {
        binary[index - 1] = 128;
        queue[tail++] = index - 1;
      }
      if (x < width - 1 && binary[index + 1] === 255) {
        binary[index + 1] = 128;
        queue[tail++] = index + 1;
      }
    }

    const value = tail >= minArea ? 255 : 0;
    for (let i = 0; i < tail; i++) binary[queue[i]] = value;
  }
}

self.onmessage = (event: MessageEvent<DifferenceRequest>) => {
  try {
    const { reference, aligned, width, height, intensityThreshold, minRegionArea } = event.data;
    const referencePixels = new Uint8ClampedArray(reference);
    const alignedPixels = new Uint8ClampedArray(aligned);
    const referenceBlurred = grayscaleBlur(referencePixels, width, height);
    const alignedBlurred = grayscaleBlur(alignedPixels, width, height);
    const binary = new Uint8Array(width * height);
    const threshold = Math.max(0, Math.min(255, intensityThreshold));

    for (let i = 0; i < binary.length; i++) {
      const alphaOffset = i * 4 + 3;
      if (referencePixels[alphaOffset] !== 0 && alignedPixels[alphaOffset] !== 0
        && Math.abs(referenceBlurred[i] - alignedBlurred[i]) > threshold) {
        binary[i] = 255;
      }
    }

    removeSmallRegions(binary, width, height, Math.max(0, minRegionArea));

    const output = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < binary.length; i++) {
      const offset = i * 4;
      output[offset] = binary[i];
      output[offset + 1] = binary[i];
      output[offset + 2] = binary[i];
      output[offset + 3] = 255;
    }

    self.postMessage({ output: output.buffer, width, height }, { transfer: [output.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
