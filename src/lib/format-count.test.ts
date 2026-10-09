import { expect, test } from 'bun:test';

import { formatCount } from './format-count';

test('counts format like YouTube views, one decimal at most', () => {
  expect(formatCount(84)).toBe('84');
  expect(formatCount(1_000)).toBe('1K');
  expect(formatCount(1_286)).toBe('1.3K');
  expect(formatCount(1_200_000)).toBe('1.2M');
  expect(formatCount(1_000_000_000)).toBe('1B');
});