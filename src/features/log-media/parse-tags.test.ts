import { describe, expect, test } from 'bun:test';

import { parseTags } from './parse-tags';

describe('parseTags', () => {
  test('drops the empty segment left by the prefill separator', () => {
    expect(parseTags('shinobu, ')).toEqual(['shinobu']);
  });

  test('trims each tag', () => {
    expect(parseTags('xgimi, shinobu')).toEqual(['xgimi', 'shinobu']);
    expect(parseTags('  imax  ,rewatch-night')).toEqual([
      'imax',
      'rewatch-night',
    ]);
  });

  test('empty and separator-only input parse to no tags', () => {
    expect(parseTags('')).toEqual([]);
    expect(parseTags(' , , ')).toEqual([]);
  });
});
