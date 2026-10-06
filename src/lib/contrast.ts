import type { Point } from './manualAnchors';

export type Shade = 'black' | 'white';

export interface CrosshairShades {
  left: Shade;
  right: Shade;
  up: Shade;
  down: Shade;
  ring: Shade;
}

/** Crosshair geometry in screen pixels. The open centre keeps the target pixel visible. */
export const CROSSHAIR = { gap: 5, arm: 18, ring: 4 } as const;

export const DEFAULT_SHADES: CrosshairShades = { left: 'white', right: 'white', up: 'white', down: 'white', ring: 'white' };

export interface Sampler {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** Buffer pixels per image pixel. */
  ratio: number;
}

/** Downsample once so pointer-move sampling stays cheap on large photographs. */
export function createSampler(image: HTMLImageElement, maxSize = 1024): Sampler {
  const ratio = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.fillStyle = 'white';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  return { data, width: canvas.width, height: canvas.height, ratio: canvas.width / image.naturalWidth };
}

function luminance(sampler: Sampler, x: number, y: number) {
  const bx = Math.max(0, Math.min(sampler.width - 1, Math.round(x * sampler.ratio)));
  const by = Math.max(0, Math.min(sampler.height - 1, Math.round(y * sampler.ratio)));
  const index = (by * sampler.width + bx) * 4;
  return sampler.data[index] * 0.2126 + sampler.data[index + 1] * 0.7152 + sampler.data[index + 2] * 0.0722;
}

/** Average luminance along a segment, sampled at roughly one buffer pixel per step. */
function segment(sampler: Sampler, from: Point, to: Point) {
  const length = Math.hypot(to.x - from.x, to.y - from.y) * sampler.ratio;
  const steps = Math.max(3, Math.min(24, Math.ceil(length)));
  let total = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    total += luminance(sampler, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
  }
  return total / (steps + 1);
}

/**
 * Average a narrow band around a stroke: the stroke line plus one parallel line on each side.
 * A hairline in the drawing directly under an arm then cannot dominate the surrounding paper.
 */
function band(sampler: Sampler, from: Point, to: Point, spread: number) {
  const horizontal = from.y === to.y;
  const dx = horizontal ? 0 : spread;
  const dy = horizontal ? spread : 0;
  return (segment(sampler, from, to)
    + segment(sampler, { x: from.x - dx, y: from.y - dy }, { x: to.x - dx, y: to.y - dy })
    + segment(sampler, { x: from.x + dx, y: from.y + dy }, { x: to.x + dx, y: to.y + dy })) / 3;
}

// Hysteresis keeps the previous shade near the threshold so paper grain and hatching don't flicker.
// A newly drawn crosshair has no previous shade and uses the midpoint instead.
function pick(brightness: number, previous?: Shade): Shade {
  if (brightness > 140) return 'black';
  if (brightness < 116) return 'white';
  return previous ?? (brightness >= 128 ? 'black' : 'white');
}

/**
 * Choose black or white separately for each arm and the centre ring from the pixels underneath it,
 * so a crosshair straddling a dark stroke on light paper remains visible on both sides.
 * `imagePerScreen` converts the screen-pixel geometry into image pixels at the current zoom.
 * Pass the previous shades while the same crosshair moves; omit them for a new one.
 */
export function crosshairShades(sampler: Sampler | null, p: Point, imagePerScreen: number, previous?: CrosshairShades): CrosshairShades {
  if (!sampler) return previous ?? DEFAULT_SHADES;
  const gap = CROSSHAIR.gap * imagePerScreen;
  const arm = CROSSHAIR.arm * imagePerScreen;
  const ring = CROSSHAIR.ring * imagePerScreen;
  const spread = 2 * imagePerScreen;
  const ringBrightness = (band(sampler, { x: p.x - ring, y: p.y }, { x: p.x + ring, y: p.y }, ring)
    + band(sampler, { x: p.x, y: p.y - ring }, { x: p.x, y: p.y + ring }, ring)) / 2;
  return {
    left: pick(band(sampler, { x: p.x - arm, y: p.y }, { x: p.x - gap, y: p.y }, spread), previous?.left),
    right: pick(band(sampler, { x: p.x + gap, y: p.y }, { x: p.x + arm, y: p.y }, spread), previous?.right),
    up: pick(band(sampler, { x: p.x, y: p.y - arm }, { x: p.x, y: p.y - gap }, spread), previous?.up),
    down: pick(band(sampler, { x: p.x, y: p.y + gap }, { x: p.x, y: p.y + arm }, spread), previous?.down),
    ring: pick(ringBrightness, previous?.ring)
  };
}
