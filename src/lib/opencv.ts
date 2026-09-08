/**
 * Self-hosted OpenCV.js client for sketch alignment and comparison.
 *
 * The official browser build is served from `public/vendor` instead of a CDN.
 * Keep this module's public API promise-based so OpenCV work can move behind a
 * worker or service boundary later without changing Svelte call sites.
 */

export type CvState = 'idle' | 'loading' | 'ready' | 'error';

export interface AlignResult {
  aligned: ImageData;
  homography: number[];
  inlierCount: number;
  method: 'manual' | 'auto' | 'none';
}

export interface AnchorSet {
  tl: [number, number];
  tr: [number, number];
  bl: [number, number];
  br: [number, number];
}

export interface AlignmentPoint {
  x: number;
  y: number;
}

export interface ManualAnchorPair {
  id: number;
  ref: AlignmentPoint;
  src: AlignmentPoint;
}

type CvRuntime = any;

const OPENCV_SCRIPT_ID = 'opencv-js-runtime';
const OPENCV_SCRIPT_URL = '/vendor/opencv-4.9.0.js';

let cvInstance: CvRuntime | null = null;
let loadPromise: Promise<void> | null = null;
const statusListeners = new Set<(message: string) => void>();

declare global {
  interface Window {
    cv?: CvRuntime;
    Module?: {
      onRuntimeInitialized?: () => void;
    };
  }
}

/** Subscribe to progress/status messages. Returns an unsubscribe fn. */
export function onStatus(listener: (message: string) => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function emitStatus(message: string) {
  for (const listener of statusListeners) listener(message);
}

/** Load the self-hosted OpenCV.js runtime. Resolves when `cv.Mat` is ready. */
export function loadOpenCV(): Promise<void> {
  if (cvInstance?.Mat || window.cv?.Mat) {
    cvInstance = cvInstance ?? window.cv ?? null;
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('OpenCV.js can only load in a browser'));
      return;
    }

    const timeout = window.setTimeout(() => {
      reject(new Error('OpenCV.js failed to initialize within 30s'));
    }, 30_000);

    const finish = () => {
      window.clearTimeout(timeout);
      const runtime = window.cv;
      if (runtime?.Mat) {
        cvInstance = runtime;
        emitStatus('OpenCV ready.');
        resolve();
      } else {
        reject(new Error('OpenCV.js initialized without cv.Mat'));
      }
    };

    emitStatus('Loading self-hosted OpenCV.js runtime...');
    const existing = document.getElementById(OPENCV_SCRIPT_ID) as HTMLScriptElement | null;
    window.Module = {
      ...(window.Module || {}),
      onRuntimeInitialized: finish,
    };

    if (existing) {
      if (window.cv?.Mat) finish();
      return;
    }

    const script = document.createElement('script');
    script.id = OPENCV_SCRIPT_ID;
    script.async = true;
    script.src = OPENCV_SCRIPT_URL;
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error(`Failed to load ${OPENCV_SCRIPT_URL}`));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    loadPromise = null;
    throw error;
  });

  return loadPromise;
}

function getCv(): CvRuntime {
  const cv = cvInstance ?? window.cv;
  if (!cv?.Mat) throw new Error('OpenCV.js is not ready');
  return cv;
}

function frameToMat(cv: CvRuntime, image: ImageData): CvRuntime {
  return cv.matFromImageData(image);
}

function matToImageData(cv: CvRuntime, mat: CvRuntime): ImageData {
  let out = mat;
  let created = false;
  if (out.channels() !== 4) {
    out = new cv.Mat();
    cv.cvtColor(mat, out, cv.COLOR_GRAY2RGBA);
    created = true;
  }

  const image = new ImageData(out.cols, out.rows);
  image.data.set(out.data);
  if (created) out.delete();
  return image;
}

function cleanup(items: CvRuntime[]) {
  for (const item of items) {
    if (item && typeof item.delete === 'function') item.delete();
  }
}

const MAX_FEATURE_DIMENSION = 1400;
const MIN_AUTO_INLIERS = 12;

function featureImage(cv: CvRuntime, gray: CvRuntime) {
  const largestDimension = Math.max(gray.cols, gray.rows);
  if (largestDimension <= MAX_FEATURE_DIMENSION) {
    return { mat: gray, scaleX: 1, scaleY: 1, resized: false };
  }

  const scale = MAX_FEATURE_DIMENSION / largestDimension;
  const width = Math.max(1, Math.round(gray.cols * scale));
  const height = Math.max(1, Math.round(gray.rows * scale));
  const mat = new cv.Mat();
  cv.resize(gray, mat, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
  return {
    mat,
    scaleX: width / gray.cols,
    scaleY: height / gray.rows,
    resized: true
  };
}

function plausibleHomography(
  homography: number[],
  sourceWidth: number,
  sourceHeight: number,
  referenceWidth: number,
  referenceHeight: number
) {
  const corners = [[0, 0], [sourceWidth, 0], [sourceWidth, sourceHeight], [0, sourceHeight]];
  const projected = corners.map(([x, y]) => {
    const denominator = homography[6] * x + homography[7] * y + homography[8];
    return [
      (homography[0] * x + homography[1] * y + homography[2]) / denominator,
      (homography[3] * x + homography[4] * y + homography[5]) / denominator
    ];
  });
  if (projected.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return false;

  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;

  return width >= referenceWidth * 0.1
    && height >= referenceHeight * 0.1
    && width <= referenceWidth * 4
    && height <= referenceHeight * 4
    && maxX > 0
    && minX < referenceWidth
    && maxY > 0
    && minY < referenceHeight;
}

/**
 * Align `source` to `reference`. Manual anchor pairs take priority when there
 * are at least 4 complete pairs; otherwise ORB feature matching is used.
 */
export async function alignImages(
  ref: ImageData,
  src: ImageData,
  manualAnchors: ManualAnchorPair[] = []
): Promise<AlignResult> {
  await loadOpenCV();
  const cv = getCv();

  if (manualAnchors.length >= 4) {
    const manualResult = alignWithManualAnchors(cv, ref, src, manualAnchors);
    if (manualResult) return manualResult;
  }

  return alignWithOrb(cv, ref, src);
}

/** Align only from user-provided point pairs; never fall back to auto alignment. */
export async function alignImagesManually(
  ref: ImageData,
  src: ImageData,
  manualAnchors: ManualAnchorPair[]
): Promise<AlignResult> {
  if (manualAnchors.length < 4) {
    throw new Error('At least four complete anchor pairs are required');
  }

  await loadOpenCV();
  const result = alignWithManualAnchors(getCv(), ref, src, manualAnchors);
  if (!result) throw new Error('These anchor points could not produce a stable alignment');
  return result;
}

function alignWithManualAnchors(
  cv: CvRuntime,
  ref: ImageData,
  src: ImageData,
  manualAnchors: ManualAnchorPair[]
): AlignResult | null {
  const refMat = frameToMat(cv, ref);
  const srcMat = frameToMat(cv, src);
  const srcPoints = manualAnchors.flatMap((anchor) => [anchor.src.x, anchor.src.y]);
  const refPoints = manualAnchors.flatMap((anchor) => [anchor.ref.x, anchor.ref.y]);
  const srcPts = cv.matFromArray(manualAnchors.length, 1, cv.CV_32FC2, srcPoints);
  const refPts = cv.matFromArray(manualAnchors.length, 1, cv.CV_32FC2, refPoints);
  const mask = new cv.Mat();
  const H = cv.findHomography(srcPts, refPts, cv.RANSAC, 4.0, mask);

  if (H.empty()) {
    cleanup([refMat, srcMat, srcPts, refPts, mask, H]);
    return null;
  }

  let inlierCount = 0;
  for (let i = 0; i < mask.rows; i++) {
    if (mask.data[i]) inlierCount++;
  }

  const warped = new cv.Mat();
  const dsize = new cv.Size(refMat.cols, refMat.rows);
  cv.warpPerspective(srcMat, warped, H, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

  const homography: number[] = [];
  for (let i = 0; i < H.rows; i++) {
    for (let j = 0; j < H.cols; j++) {
      homography.push(H.data64F[i * H.cols + j]);
    }
  }

  const aligned = matToImageData(cv, warped);
  cleanup([refMat, srcMat, srcPts, refPts, mask, H, warped]);

  return { aligned, homography, inlierCount, method: 'manual' };
}

function alignWithOrb(cv: CvRuntime, ref: ImageData, src: ImageData): AlignResult {
  const refMat = frameToMat(cv, ref);
  const srcMat = frameToMat(cv, src);

  const refGray = new cv.Mat();
  const srcGray = new cv.Mat();
  cv.cvtColor(refMat, refGray, cv.COLOR_RGBA2GRAY);
  cv.cvtColor(srcMat, srcGray, cv.COLOR_RGBA2GRAY);
  const refFeature = featureImage(cv, refGray);
  const srcFeature = featureImage(cv, srcGray);

  const orb = new cv.ORB(2000);
  const refKp = new cv.KeyPointVector();
  const srcKp = new cv.KeyPointVector();
  const refDesc = new cv.Mat();
  const srcDesc = new cv.Mat();
  const refMask = new cv.Mat();
  const srcMask = new cv.Mat();
  orb.detectAndCompute(refFeature.mat, refMask, refKp, refDesc);
  orb.detectAndCompute(srcFeature.mat, srcMask, srcKp, srcDesc);

  const bf = new cv.BFMatcher(cv.NORM_HAMMING);
  const matches = new cv.DMatchVectorVector();
  bf.knnMatch(srcDesc, refDesc, matches, 2);

  const goodSrcPts: number[] = [];
  const goodRefPts: number[] = [];
  for (let i = 0; i < matches.size(); i++) {
    const m = matches.get(i);
    if (m.size() >= 2) {
      const m0 = m.get(0);
      const m1 = m.get(1);
      if (m0.distance < 0.75 * m1.distance) {
        const srcPt = srcKp.get(m0.queryIdx).pt;
        const refPt = refKp.get(m0.trainIdx).pt;
        goodSrcPts.push(srcPt.x, srcPt.y);
        goodRefPts.push(refPt.x, refPt.y);
      }
    }
  }

  if (goodSrcPts.length >= 8) {
    const srcPts = cv.matFromArray(goodSrcPts.length / 2, 1, cv.CV_32FC2, goodSrcPts);
    const refPts = cv.matFromArray(goodRefPts.length / 2, 1, cv.CV_32FC2, goodRefPts);
    const mask = new cv.Mat();
    const H = cv.findHomography(srcPts, refPts, cv.RANSAC, 5.0, mask);

    if (!H.empty()) {
      let inlierCount = 0;
      for (let i = 0; i < mask.rows; i++) {
        if (mask.data[i]) inlierCount++;
      }

      const h = H.data64F;
      const homography = [
        h[0] * srcFeature.scaleX / refFeature.scaleX,
        h[1] * srcFeature.scaleY / refFeature.scaleX,
        h[2] / refFeature.scaleX,
        h[3] * srcFeature.scaleX / refFeature.scaleY,
        h[4] * srcFeature.scaleY / refFeature.scaleY,
        h[5] / refFeature.scaleY,
        h[6] * srcFeature.scaleX,
        h[7] * srcFeature.scaleY,
        h[8]
      ];
      if (inlierCount >= MIN_AUTO_INLIERS && plausibleHomography(
        homography,
        srcMat.cols,
        srcMat.rows,
        refMat.cols,
        refMat.rows
      )) {
        const fullResolutionH = cv.matFromArray(3, 3, cv.CV_64F, homography);
        const warped = new cv.Mat();
        const dsize = new cv.Size(refMat.cols, refMat.rows);
        cv.warpPerspective(srcMat, warped, fullResolutionH, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

        const aligned = matToImageData(cv, warped);

        cleanup([
          refMat, srcMat, refGray, srcGray, refMask, srcMask, refKp, srcKp,
          refDesc, srcDesc, orb, bf, matches, srcPts, refPts, mask, H, fullResolutionH, warped,
          ...(refFeature.resized ? [refFeature.mat] : []),
          ...(srcFeature.resized ? [srcFeature.mat] : [])
        ]);
        return { aligned, homography, inlierCount, method: 'auto' };
      }
    }

    cleanup([srcPts, refPts, mask, H]);
  }

  const aligned = new ImageData(src.width, src.height);
  aligned.data.set(src.data);
  cleanup([
    refMat, srcMat, refGray, srcGray, refMask, srcMask, refKp, srcKp,
    refDesc, srcDesc, orb, bf, matches,
    ...(refFeature.resized ? [refFeature.mat] : []),
    ...(srcFeature.resized ? [srcFeature.mat] : [])
  ]);

  return { aligned, homography: [], inlierCount: 0, method: 'none' };
}

/** Detect grid intersection anchors at the 4 extremes of the image. */
export async function detectGridAnchors(image: ImageData): Promise<AnchorSet | null> {
  await loadOpenCV();
  const cv = getCv();
  const mat = frameToMat(cv, image);
  const gray = new cv.Mat();
  cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);

  const bw = new cv.Mat();
  cv.adaptiveThreshold(gray, bw, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 5);

  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(30, 1));
  const hLines = new cv.Mat();
  cv.morphologyEx(bw, hLines, cv.MORPH_OPEN, kernel);

  const vKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, 30));
  const vLines = new cv.Mat();
  cv.morphologyEx(bw, vLines, cv.MORPH_OPEN, vKernel);

  const intersection = new cv.Mat();
  cv.bitwise_and(hLines, vLines, intersection);

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
    cnt.delete();
  }

  cleanup([mat, gray, bw, kernel, hLines, vKernel, vLines, intersection, contours, hierarchy]);

  if (points.length < 4) return null;

  const midX = image.width / 2;
  const midY = image.height / 2;

  const topLeft = points
    .filter(([x, y]) => x < midX && y < midY)
    .sort((a, b) => a[0] + a[1] - (b[0] + b[1]))[0];
  const topRight = points
    .filter(([x, y]) => x >= midX && y < midY)
    .sort((a, b) => b[0] - a[1] - (a[0] - b[1]))[0];
  const bottomLeft = points
    .filter(([x, y]) => x < midX && y >= midY)
    .sort((a, b) => a[0] - b[1] - (b[0] - a[1]))[0];
  const bottomRight = points
    .filter(([x, y]) => x >= midX && y >= midY)
    .sort((a, b) => a[0] + a[1] - (b[0] + b[1]))
    .reverse()[0];

  if (!topLeft || !topRight || !bottomLeft || !bottomRight) return null;

  return { tl: topLeft, tr: topRight, bl: bottomLeft, br: bottomRight };
}
