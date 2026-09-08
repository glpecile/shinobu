import { describe, expect, test } from 'bun:test';

import { episodeCode, episodeMetaLine } from './episode-label';

describe('episode labels', () => {
  test('the code and the meta line compose from whatever the source carried', () => {
    expect(episodeCode(2, 10)).toBe('S2 E10');
    // A bare TMDB date must read as that day, not the day before west of UTC.
    expect(episodeMetaLine({ firstAired: '2026-09-03', runtime: 28 })).toBe(
      'Sep 3, 2026 · 28 min',
    );
    expect(episodeMetaLine({ runtime: 28 })).toBe('28 min');
    expect(episodeMetaLine({})).toBe('');
  });
});
