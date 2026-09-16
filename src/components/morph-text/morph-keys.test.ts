import { describe, expect, test } from 'bun:test';

import { initialRun, morphRun } from './morph-keys';

const keysOf = (text: string, next: string) =>
  morphRun(initialRun(text), next).glyphs.map((glyph) => glyph.key);

describe('morphRun', () => {
  test('same text is the same run', () => {
    const run = initialRun('Show more');
    expect(morphRun(run, 'Show more')).toBe(run);
  });

  test('a changed digit keeps every other glyph', () => {
    expect(keysOf('Log S01E04', 'Log S01E05')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 10]);
  });

  test('a carry keeps the shared digit and inserts the new one', () => {
    expect(keysOf('9', '10')).toEqual([1, 2]);
    expect(keysOf('19', '20')).toEqual([2, 3]);
    expect(keysOf('99', '100')).toEqual([2, 3, 4]);
  });

  test('a swapped word keeps the shared prefix and any shared letter', () => {
    // "more" → "less" share only the e, which slides two slots left.
    expect(keysOf('Show more', 'Show less')).toEqual([0, 1, 2, 3, 4, 9, 8, 10, 11]);
  });

  test('keys never repeat across successive runs', () => {
    const a = initialRun('more');
    const b = morphRun(a, 'less');
    const c = morphRun(b, 'more');
    expect(c.glyphs.map((glyph) => glyph.key)).toEqual([7, 8, 9, 3]);
  });

  test('splits by code point, not UTF-16 unit', () => {
    expect(initialRun('忍 🍿').glyphs.map((glyph) => glyph.char)).toEqual(['忍', ' ', '🍿']);
  });
});
