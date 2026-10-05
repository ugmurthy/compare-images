import type { Point } from './manualAnchors';

export interface Calibration {
  points: [Point, Point];
  horizontal: number | null;
  vertical: number | null;
  unit: string;
}

export function measure(points: [Point, Point], calibration: Calibration) {
  const horizontal = Math.abs(calibration.points[1].x - calibration.points[0].x);
  const vertical = Math.abs(calibration.points[1].y - calibration.points[0].y);
  return {
    horizontal: horizontal > 0 ? Math.abs(points[1].x - points[0].x) / horizontal : null,
    vertical: vertical > 0 ? Math.abs(points[1].y - points[0].y) / vertical : null
  };
}

export function validCalibration(value: unknown, width: number, height: number): value is Calibration {
  if (!value || typeof value !== 'object') return false;
  const c = value as Calibration;
  const size = (n: unknown) => n === null || (typeof n === 'number' && Number.isFinite(n) && n > 0);
  return Array.isArray(c.points) && c.points.length === 2 && c.points.every((p) => p
    && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height)
    && (c.points[0].x !== c.points[1].x || c.points[0].y !== c.points[1].y)
    && size(c.horizontal) && size(c.vertical) && typeof c.unit === 'string' && c.unit.length <= 20;
}
