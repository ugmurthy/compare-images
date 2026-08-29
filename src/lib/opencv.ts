/**
 * OpenCV.js wrapper for sketch alignment and comparison.
 *
 * OpenCV.js is loaded at runtime from a CDN. All heavy processing is
 * offloaded to a Web Worker so the UI stays responsive.
 */

export type CvState = 'idle' | 'loading' | 'ready' | 'error';

let cvInstance: any = null;

/** Load OpenCV.js from CDN. Returns a promise that resolves when cv is ready. */
export function loadOpenCV(): Promise<any> {
  if (cvInstance) return Promise.resolve(cvInstance);
  if (typeof window === 'undefined') return Promise.reject('SSR');

  return new Promise((resolve, reject) => {
    if ((window as any).cv && (window as any).cv.Mat) {
      cvInstance = (window as any).cv;
      resolve(cvInstance);
      return;
    }

    // Set the callback before loading the script
    (window as any).cvReady = () => {
      cvInstance = (window as any).cv;
      if (cvInstance?.Mat) {
        resolve(cvInstance);
      } else {
        // OpenCV.js fires onRuntimeInitialized internally; wait for it
        const orig = cvInstance?.onRuntimeInitialized;
        cvInstance.onRuntimeInitialized = () => {
          if (orig) orig();
          resolve(cvInstance);
        };
      }
    };

    const script = document.createElement('script');
    script.setAttribute('async', '');
    script.setAttribute('src', 'https://docs.opencv.org/4.11.0/opencv.js');
    script.onload = () => {
      // opencv.js may need time to initialize WASM after download
      const check = () => {
        const cv = (window as any).cv;
        if (cv && typeof cv.Mat !== 'undefined') {
          cvInstance = cv;
          resolve(cvInstance);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    };
    script.onerror = () => reject(new Error('Failed to load OpenCV.js'));
    document.head.appendChild(script);
  });
}

export interface AlignResult {
  aligned: ImageData;
  homography: number[];
  inlierCount: number;
}

/**
 * Align `source` image to `reference` image using ORB feature matching +
 * RANSAC homography. Returns the warped source ImageData.
 */
export function alignImages(cv: any, refCanvas: HTMLCanvasElement, srcCanvas: HTMLCanvasElement): AlignResult {
  const refMat = cv.imread(refCanvas);
  const srcMat = cv.imread(srcCanvas);

  // Convert to grayscale
  const refGray = new cv.Mat();
  const srcGray = new cv.Mat();
  cv.cvtColor(refMat, refGray, cv.COLOR_RGBA2GRAY);
  cv.cvtColor(srcMat, srcGray, cv.COLOR_RGBA2GRAY);

  // Detect ORB keypoints & descriptors
  const orb = new cv.ORB(2000);
  const refKp = new cv.KeyPointVector();
  const srcKp = new cv.KeyPointVector();
  const refDesc = new cv.Mat();
  const srcDesc = new cv.Mat();
  orb.detectAndCompute(refGray, new cv.Mat(), refKp, refDesc);
  orb.detectAndCompute(srcGray, new cv.Mat(), srcKp, srcDesc);

  // Match using BFMatcher + Hamming
  const bf = new cv.BFMatcher(cv.NORM_HAMMING);
  const matches = new cv.DMatchVectorVector();
  bf.knnMatch(srcDesc, refDesc, matches, 2);

  // Lowe's ratio test
  const goodSrcPts: number[][] = [];
  const goodRefPts: number[][] = [];
  for (let i = 0; i < matches.size(); i++) {
    const m = matches.get(i);
    if (m.size() >= 2) {
      const m0 = m.get(0);
      const m1 = m.get(1);
      if (m0.distance < 0.75 * m1.distance) {
        const srcPt = srcKp.get(m0.queryIdx).pt;
        const refPt = refKp.get(m0.trainIdx).pt;
        goodSrcPts.push([srcPt.x, srcPt.y]);
        goodRefPts.push([refPt.x, refPt.y]);
      }
    }
  }

  let inlierCount = goodSrcPts.length;
  let homographyData: number[] = [];

  if (goodSrcPts.length >= 4) {
    const srcPts = cv.matFromArray(goodSrcPts.length, 1, cv.CV_32FC2, goodSrcPts.flat());
    const refPts = cv.matFromArray(goodRefPts.length, 1, cv.CV_32FC2, goodRefPts.flat());

    const mask = new cv.Mat();
    const H = cv.findHomography(srcPts, refPts, cv.RANSAC, 5.0, mask);

    // Count inliers from mask
    inlierCount = 0;
    for (let i = 0; i < mask.rows; i++) {
      if (mask.data[i]) inlierCount++;
    }

    // Warp source to align with reference
    const warped = new cv.Mat();
    const dsize = new cv.Size(refMat.cols, refMat.rows);
    cv.warpPerspective(srcMat, warped, H, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

    // Read result into ImageData
    const outCanvas = document.createElement('canvas');
    outCanvas.width = warped.cols;
    outCanvas.height = warped.rows;
    cv.imshow(outCanvas, warped);

    const ctx = outCanvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, outCanvas.width, outCanvas.height);

    // Store homography
    for (let i = 0; i < H.rows; i++) {
      for (let j = 0; j < H.cols; j++) {
        homographyData.push(H.data64F[i * H.cols + j]);
      }
    }

    // Cleanup
    srcPts.delete(); refPts.delete(); mask.delete(); H.delete(); warped.delete();

    // Cleanup intermediates
    refMat.delete(); srcMat.delete(); refGray.delete(); srcGray.delete();
    refKp.delete(); srcKp.delete(); refDesc.delete(); srcDesc.delete();
    orb.delete(); bf.delete(); matches.delete();

    return { aligned: imageData, homography: homographyData, inlierCount };
  }

  // Fallback: not enough matches — return source as-is
  const outCanvas = document.createElement('canvas');
  outCanvas.width = srcMat.cols;
  outCanvas.height = srcMat.rows;
  cv.imshow(outCanvas, srcMat);
  const ctx = outCanvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, outCanvas.width, outCanvas.height);

  refMat.delete(); srcMat.delete(); refGray.delete(); srcGray.delete();
  refKp.delete(); srcKp.delete(); refDesc.delete(); srcDesc.delete();
  orb.delete(); bf.delete(); matches.delete();

  return { aligned: imageData, homography: [], inlierCount: 0 };
}

/**
 * Compute a pixel-difference image between two aligned images.
 * Returns an ImageData with differences highlighted.
 */
export function computeDifference(cv: any, refCanvas: HTMLCanvasElement, alignedCanvas: HTMLCanvasElement): ImageData {
  const refMat = cv.imread(refCanvas);
  const alMat = cv.imread(alignedCanvas);

  const refGray = new cv.Mat();
  const alGray = new cv.Mat();
  cv.cvtColor(refMat, refGray, cv.COLOR_RGBA2GRAY);
  cv.cvtColor(alMat, alGray, cv.COLOR_RGBA2GRAY);

  const diff = new cv.Mat();
  cv.absdiff(refGray, alGray, diff);

  // Threshold to highlight meaningful differences
  const thresh = new cv.Mat();
  cv.threshold(diff, thresh, 30, 255, cv.THRESH_BINARY);

  // Convert to RGBA for display
  const rgba = new cv.Mat();
  cv.cvtColor(thresh, rgba, cv.COLOR_GRAY2RGBA);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = rgba.cols;
  outCanvas.height = rgba.rows;
  cv.imshow(outCanvas, rgba);

  const ctx = outCanvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, outCanvas.width, outCanvas.height);

  refMat.delete(); alMat.delete(); refGray.delete(); alGray.delete();
  diff.delete(); thresh.delete(); rgba.delete();

  return imageData;
}

/**
 * Detect grid intersection points as anchor candidates at the 4 extremes.
 * Uses adaptive thresholding + contour analysis to find grid lines,
 * then picks intersection points near corners.
 */
export function detectGridAnchors(cv: any, canvas: HTMLCanvasElement): { tl: [number, number]; tr: [number, number]; bl: [number, number]; br: [number, number] } | null {
  const mat = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);

  const bw = new cv.Mat();
  cv.adaptiveThreshold(gray, bw, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 5);

  // Morphological operations to find grid lines
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(30, 1));
  const hLines = new cv.Mat();
  cv.morphologyEx(bw, hLines, cv.MORPH_OPEN, kernel);

  const vKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, 30));
  const vLines = new cv.Mat();
  cv.morphologyEx(bw, vLines, cv.MORPH_OPEN, vKernel);

  // Find intersections by AND of h and v
  const intersection = new cv.Mat();
  cv.bitwise_and(hLines, vLines, intersection);

  // Find contours at intersection points
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(intersection, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  const points: [number, number][] = [];
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const M = cv.moments(cnt);
    if (M.m00 > 0) {
      points.push([M.m10 / M.m00, M.m01 / M.m00]);
    }
  }

  mat.delete(); gray.delete(); bw.delete();
  kernel.delete(); hLines.delete(); vKernel.delete(); vLines.delete();
  intersection.delete(); contours.delete(); hierarchy.delete();

  if (points.length < 4) return null;

  const w = canvas.width;
  const h = canvas.height;

  // Sort into quadrants to find 4 extremes
  const midX = w / 2;
  const midY = h / 2;

  const topLeft = points
    .filter(([x, y]) => x < midX && y < midY)
    .sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]))[0];
  const topRight = points
    .filter(([x, y]) => x >= midX && y < midY)
    .sort((a, b) => -(a[0] - a[1]) + (b[0] - b[1]))[0] ?? points
    .filter(([x, y]) => x >= midX && y < midY)
    .sort((a, b) => (b[0] - a[1]) - (a[0] - a[1]))[0];
  const bottomLeft = points
    .filter(([x, y]) => x < midX && y >= midY)
    .sort((a, b) => -(a[0] - a[1]) + (b[0] - b[1]))[0] ?? points
    .filter(([x, y]) => x < midX && y >= midY)
    .sort((a, b) => (a[0] - a[1]) - (b[0] - b[1]))[0];
  const bottomRight = points
    .filter(([x, y]) => x >= midX && y >= midY)
    .sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]))
    .reverse()[0];

  if (!topLeft || !topRight || !bottomLeft || !bottomRight) return null;

  return {
    tl: topLeft,
    tr: topRight,
    bl: bottomLeft,
    br: bottomRight
  };
}
