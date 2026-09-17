import { describe, expect, test } from 'bun:test';

import {
  activeTagFragment,
  committedTags,
  filterTagSuggestions,
  isTagSelected,
  parseTags,
  pinSelectedTags,
  toggleTag,
} from './parse-tags';

describe('parseTags', () => {

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

describe('committedTags', () => {
  test('excludes the tail, which is still being typed', () => {
    expect(committedTags('shinobu, net')).toEqual(['shinobu']);
    expect(committedTags('net')).toEqual([]);
  });

  test('takes everything once the tail is committed with a comma', () => {
    expect(committedTags('shinobu, netflix, ')).toEqual(['shinobu', 'netflix']);
    expect(committedTags('shinobu, netflix,')).toEqual(['shinobu', 'netflix']);
  });

});

describe('isTagSelected', () => {
  test('matches case-insensitively', () => {
    expect(isTagSelected('shinobu, Horror, ', 'horror')).toBe(true);
    expect(isTagSelected('shinobu, horror, ', 'Horror')).toBe(true);
  });

  test('does not match a prefix of another tag', () => {
    expect(isTagSelected('shinobu, horror-night, ', 'horror')).toBe(false);
    expect(isTagSelected('', 'horror')).toBe(false);
  });

});

describe('toggleTag', () => {

  test('always leaves a trailing separator, so the picker filter resets', () => {
    // The whole point: `activeTagFragment` of the result must be empty,
    // otherwise tapping a chip would leave the suggestions filtered by the tag
    // that was just added.
    for (const input of ['', 'imax', 'imax, rewatch-night', 'shinobu, ']) {
      expect(activeTagFragment(toggleTag(input, 'horror'))).toBe('');
    }
    expect(toggleTag('', 'horror')).toBe('horror, ');
    // "imax" here is an uncommitted tail, so the chip replaces it.
    expect(toggleTag('imax', 'horror')).toBe('horror, ');
    expect(toggleTag('imax, ', 'horror')).toBe('imax, horror, ');
  });

  test('add then remove restores the prefill convention', () => {
    const prefill = 'shinobu, ';
    expect(toggleTag(toggleTag(prefill, 'horror'), 'horror')).toBe(prefill);
    // Committed values round-trip; an uncommitted tail does not, because the
    // first press consumed it by design.
    expect(toggleTag(toggleTag('imax, ', 'horror'), 'horror')).toBe('imax, ');
  });

  test('removing the last committed tag empties the field', () => {
    expect(toggleTag('horror, ', 'horror')).toBe('');
  });

  test('pressing the chip for a tag you are mid-way through typing commits it', () => {
    // Not a removal: "horror" with no trailing comma is still a query, so its
    // chip reads unselected and the press finishes the word.
    expect(isTagSelected('horror', 'horror')).toBe(false);
    expect(toggleTag('horror', 'horror')).toBe('horror, ');
  });

  test('removes case-insensitively and normalizes stray whitespace', () => {
    expect(toggleTag('  imax  ,Horror, ', 'horror')).toBe('imax, ');
    expect(toggleTag(' , shinobu , ,horror , ', 'shinobu')).toBe('horror, ');
  });

  test('replaces what is being typed rather than keeping it as a tag', () => {
    // The reported bug: typing "net" then pressing netflix left a stray "net".
    expect(toggleTag('shinobu, net', 'netflix')).toBe('shinobu, netflix, ');
    expect(toggleTag('net', 'netflix')).toBe('netflix, ');
    expect(toggleTag('shinobu, netfl', 'netflix')).toBe('shinobu, netflix, ');
  });

  test('the tail is dropped on removal too, since it is only a query', () => {
    expect(toggleTag('shinobu, netflix, net', 'netflix')).toBe('shinobu, ');
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

});

describe('pinSelectedTags', () => {
  const pool = ['netflix', 'xgimi', 'p', 'cinepolis-recoleta', 'shinobu'];

  test('pins in the order the field lists them, not the pool order', () => {
    expect(pinSelectedTags(pool, 'p, netflix, ')).toEqual([
      'p',
      'netflix',
      'xgimi',
      'cinepolis-recoleta',
      'shinobu',
    ]);
  });

  test('a committed tag the pool has never seen still gets a chip', () => {
    expect(pinSelectedTags(pool, 'rewatch, ')[0]).toBe('rewatch');
    expect(pinSelectedTags(pool, 'rewatch, ')).toHaveLength(pool.length + 1);
  });

  test('matches case-insensitively and keeps the pool spelling', () => {
    expect(pinSelectedTags(['Netflix'], 'netflix, ')).toEqual(['Netflix']);
  });

  test('a tag repeated in the field is pinned once', () => {
    expect(pinSelectedTags(pool, 'p, P, ')).toEqual([
      'p',
      'netflix',
      'xgimi',
      'cinepolis-recoleta',
      'shinobu',
    ]);
  });
});
