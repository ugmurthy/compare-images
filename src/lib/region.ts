import type { Point } from './manualAnchors';

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Use integer pixel edges, independent of drag direction and display scale.
export function regionFromPoints(a: Point, b: Point, width: number, height: number): Region | null {
  const x = Math.max(0, Math.floor(Math.min(a.x, b.x)));
  const y = Math.max(0, Math.floor(Math.min(a.y, b.y)));
  const right = Math.min(width, Math.ceil(Math.max(a.x, b.x)));
  const bottom = Math.min(height, Math.ceil(Math.max(a.y, b.y)));
  if (a.x === b.x || a.y === b.y || right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}
