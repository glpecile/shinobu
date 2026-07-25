import { describe, expect, test } from 'bun:test';

import { hasTag, parseTags, toggleTag } from './parse-tags';

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

describe('hasTag', () => {
  test('matches case-insensitively', () => {
    expect(hasTag('shinobu, Horror', 'horror')).toBe(true);
    expect(hasTag('shinobu, horror', 'Horror')).toBe(true);
  });

  test('does not match a prefix of another tag', () => {
    expect(hasTag('shinobu, horror-night', 'horror')).toBe(false);
    expect(hasTag('', 'horror')).toBe(false);
  });
});

describe('toggleTag', () => {
  test('appending to the prefill separator leaves no empty segment', () => {
    expect(toggleTag('shinobu, ', 'horror')).toBe('shinobu, horror, ');
    expect(parseTags(toggleTag('shinobu, ', 'horror'))).toEqual([
      'shinobu',
      'horror',
    ]);
  });

  test('add then remove restores the original value exactly', () => {
    const prefill = 'shinobu, ';
    expect(toggleTag(toggleTag(prefill, 'horror'), 'horror')).toBe(prefill);

    const typed = 'imax, rewatch-night';
    expect(toggleTag(toggleTag(typed, 'horror'), 'horror')).toBe(typed);
  });

  test('appends without a trailing separator when the value had none', () => {
    expect(toggleTag('imax', 'horror')).toBe('imax, horror');
    expect(toggleTag('', 'horror')).toBe('horror');
  });

  test('removing the last tag empties the field rather than leaving a comma', () => {
    expect(toggleTag('horror, ', 'horror')).toBe('');
    expect(toggleTag('horror', 'horror')).toBe('');
  });

  test('removes case-insensitively and normalizes stray whitespace', () => {
    expect(toggleTag('  imax  ,Horror', 'horror')).toBe('imax');
    expect(toggleTag(' , shinobu , ,horror ', 'shinobu')).toBe('horror');
  });
});
