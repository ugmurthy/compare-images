import { expect, test } from 'bun:test';
import { regionFromPoints } from '../src/lib/region';

test('normalizes reverse drags with outward pixel rounding', () => {
  const a = { x: 83.2, y: 59.7 };
  const b = { x: 12.4, y: 21.1 };
  const expected = { x: 12, y: 21, width: 72, height: 39 };
  expect(regionFromPoints(a, b, 160, 90)).toEqual(expected);
  expect(regionFromPoints(b, a, 160, 90)).toEqual(expected);
});

test('clips to unequal image dimensions, including the last pixel', () => {
  expect(regionFromPoints({ x: -8, y: 23 }, { x: 200, y: 130 }, 160, 90))
    .toEqual({ x: 0, y: 23, width: 160, height: 67 });
  expect(regionFromPoints({ x: 159, y: 89 }, { x: 160, y: 90 }, 160, 90))
    .toEqual({ x: 159, y: 89, width: 1, height: 1 });
});

test('rejects clicks, lines, and completely out-of-bounds rectangles', () => {
  expect(regionFromPoints({ x: 4.2, y: 5.3 }, { x: 4.2, y: 5.3 }, 160, 90)).toBeNull();
  expect(regionFromPoints({ x: 4.2, y: 5 }, { x: 4.2, y: 25 }, 160, 90)).toBeNull();
  expect(regionFromPoints({ x: 5, y: 9.2 }, { x: 35, y: 9.2 }, 160, 90)).toBeNull();
  expect(regionFromPoints({ x: 180, y: 12 }, { x: 220, y: 44 }, 160, 90)).toBeNull();
});
