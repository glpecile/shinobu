import { expect, test } from 'bun:test';

import { chaptersThrough, stepThroughChapter, throughChapterSchema, throughChapterText } from './through-chapter-schema';

test('a range runs from the next chapter, and a lower one is refused', () => {
  expect(throughChapterSchema(6).safeParse({ through: '9' }).success).toBe(true);
  expect(chaptersThrough(6, 9)).toEqual([6, 7, 8, 9]);
  expect(throughChapterSchema(6).safeParse({ through: '5' }).error?.issues.map((issue) => issue.message)).toEqual(['Enter chapter 6 or later.']);
});

test('typing and stepping stay within the total', () => {
  expect(throughChapterText('70', 6, 59)).toBe('59');
  expect(throughChapterText('01,200', 6)).toBe('1200');
  expect(stepThroughChapter('12', 1, 6, 59)).toBe('13');
  expect(stepThroughChapter('59', 1, 6, 59)).toBe('59');
  expect(stepThroughChapter('', -1, 6)).toBe('6');
});

test('without a total, the cap never falls below the next chapter', () => {
  expect(stepThroughChapter('10000', 1, 10000)).toBe('10000');
  expect(throughChapterText('10001', 10000)).toBe('10000');
});
