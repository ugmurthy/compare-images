import { expect, test } from 'bun:test';
import { storageLevel } from '../src/lib/history';

test('storage warnings change at 60% and 80% of quota', () => {
  expect(storageLevel(0)).toBe('ok');
  expect(storageLevel(0.5999)).toBe('ok');
  expect(storageLevel(0.6)).toBe('warning');
  expect(storageLevel(0.7999)).toBe('warning');
  expect(storageLevel(0.8)).toBe('critical');
  expect(storageLevel(1.1)).toBe('critical');
});
