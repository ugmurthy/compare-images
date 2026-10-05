import { expect, test } from 'bun:test';
import { measure, validCalibration, type Calibration } from '../src/lib/measurement';

const calibration: Calibration = {
  points: [{ x: 30, y: 50 }, { x: 230, y: 150 }], horizontal: 2, vertical: 3, unit: 'cm'
};

test('axis distances use separate reference spans, independent of point order or crop origin', () => {
  expect(measure([{ x: 180, y: 120 }, { x: 60, y: 85 }], calibration)).toEqual({ horizontal: 0.6, vertical: 0.35 });
  expect(measure([{ x: 40, y: 80 }, { x: 160, y: 115 }], calibration)).toEqual({ horizontal: 0.6, vertical: 0.35 });
  expect(measure([{ x: 0, y: 0 }, { x: 300, y: 0 }], calibration)).toEqual({ horizontal: 1.5, vertical: 0 });
});

test('an uncalibrated axis is unavailable, not zero or infinity', () => {
  const horizontal: Calibration = { ...calibration, points: [{ x: 30, y: 50 }, { x: 230, y: 50 }], vertical: null };
  expect(measure([{ x: 80, y: 30 }, { x: 80, y: 130 }], horizontal)).toEqual({ horizontal: 0, vertical: null });
});

test('calibration accepts percent-only and single-axis scales, rejects invalid backup data', () => {
  expect(validCalibration(calibration, 300, 200)).toBe(true);
  expect(validCalibration({ ...calibration, horizontal: null, vertical: null }, 300, 200)).toBe(true);
  expect(validCalibration({ ...calibration, points: [{ x: 30, y: 50 }, { x: 230, y: 50 }] }, 300, 200)).toBe(true);
  for (const invalid of [
    { ...calibration, points: [{ x: 30, y: 50 }, { x: 30, y: 50 }] },
    { ...calibration, points: [{ x: -1, y: 50 }, { x: 230, y: 150 }] },
    { ...calibration, points: [{ x: 30, y: 50 }, { x: 301, y: 150 }] },
    { ...calibration, horizontal: 0 }, { ...calibration, vertical: -3 },
    { ...calibration, horizontal: Infinity }, { ...calibration, unit: 5 }
  ]) expect(validCalibration(invalid, 300, 200)).toBe(false);
});
