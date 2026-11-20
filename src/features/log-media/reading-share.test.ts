import { expect, test } from 'bun:test';

import { pageAt, percentRead, stepPage } from './reading-share';

test('a share between the ends stays a progress log on a short book', () => {
  expect(pageAt(99, 50)).toBe(49);
  expect(pageAt(1, 20)).toBe(1);
  expect(pageAt(0, 20)).toBe(0);
  expect(pageAt(100, 20)).toBe(20);
});

test('only the last page reads as 100%', () => {
  expect(percentRead(299, 300)).toBe(99);
  expect(percentRead(300, 300)).toBe(100);
  expect(percentRead(1, 300)).toBe(1);
});

test('a step moves one unit and stays on the book', () => {
  expect(stepPage(26, 204, 1, true)).toBe(27);
  expect(stepPage(26, 204, 1, false)).toBe(29);
  expect(stepPage(10, 50, -1, false)).toBe(9);
  expect(stepPage(0, 204, -1, false)).toBe(0);
  expect(stepPage(204, 204, 1, true)).toBe(204);
});
