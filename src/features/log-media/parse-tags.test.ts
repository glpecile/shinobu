import { describe, expect, test } from 'bun:test';

import {
  activeTagFragment,
  filterTagSuggestions,
  hasTag,
  parseTags,
  toggleTag,
} from './parse-tags';

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

  test('always leaves a trailing separator, so the picker filter resets', () => {
    // The whole point: `activeTagFragment` of the result must be empty,
    // otherwise tapping a chip would leave the suggestions filtered by the tag
    // that was just added.
    for (const input of ['', 'imax', 'imax, rewatch-night', 'shinobu, ']) {
      expect(activeTagFragment(toggleTag(input, 'horror'))).toBe('');
    }
    expect(toggleTag('imax', 'horror')).toBe('imax, horror, ');
    expect(toggleTag('', 'horror')).toBe('horror, ');
  });

  test('add then remove restores the prefill convention', () => {
    const prefill = 'shinobu, ';
    expect(toggleTag(toggleTag(prefill, 'horror'), 'horror')).toBe(prefill);
    // A value typed without a trailing separator gains one — cursor-ready, and
    // still the same tag set.
    expect(parseTags(toggleTag(toggleTag('imax', 'horror'), 'horror'))).toEqual([
      'imax',
    ]);
  });

  test('removing the last tag empties the field rather than leaving a comma', () => {
    expect(toggleTag('horror, ', 'horror')).toBe('');
    expect(toggleTag('horror', 'horror')).toBe('');
  });

  test('removes case-insensitively and normalizes stray whitespace', () => {
    expect(toggleTag('  imax  ,Horror', 'horror')).toBe('imax, ');
    expect(toggleTag(' , shinobu , ,horror ', 'shinobu')).toBe('horror, ');
  });
});

describe('activeTagFragment', () => {
  test('is what is being typed after the last separator', () => {
    expect(activeTagFragment('shinobu, net')).toBe('net');
    expect(activeTagFragment('net')).toBe('net');
  });

  test('is empty right after a comma, which is what resets the filter', () => {
    expect(activeTagFragment('shinobu,')).toBe('');
    expect(activeTagFragment('shinobu, ')).toBe('');
    expect(activeTagFragment('')).toBe('');
  });

  test('keeps interior spaces — tag names can contain them', () => {
    expect(activeTagFragment('shinobu, sped u')).toBe('sped u');
  });
});

describe('filterTagSuggestions', () => {
  const all = ['netflix', 'cinepolis-recoleta', 'sped up', 'p', 'imax'];

  test('an empty fragment filters nothing', () => {
    expect(filterTagSuggestions(all, '')).toEqual(all);
    expect(filterTagSuggestions(all, '   ')).toEqual(all);
  });

  test('prefix matches rank above mere substring matches', () => {
    // "p" prefixes "p" itself; the others only contain it.
    expect(filterTagSuggestions(all, 'p')).toEqual([
      'p',
      'cinepolis-recoleta',
      'sped up',
    ]);
  });

  test('matches case-insensitively and preserves source order within a rank', () => {
    expect(filterTagSuggestions(all, 'NET')).toEqual(['netflix']);
    expect(filterTagSuggestions(['ab', 'ac', 'xa'], 'a')).toEqual([
      'ab',
      'ac',
      'xa',
    ]);
  });

  test('no match yields nothing, not everything', () => {
    expect(filterTagSuggestions(all, 'zzz')).toEqual([]);
  });
});
