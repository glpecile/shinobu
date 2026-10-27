import { describe, expect, test } from 'bun:test';

import { episodeCode, formatAirDate } from './episode-label';

describe('episode labels', () => {
  test('the code and the air date compose from whatever the source carried', () => {
    expect(episodeCode(2, 10)).toBe('S2E10');
    // A bare TMDB date must read as that day, not the day before west of UTC.
    expect(formatAirDate('2026-09-03')).toBe('Thu, Sep 3, 2026');
  });
});
