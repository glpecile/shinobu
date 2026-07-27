import { describe, expect, test } from 'bun:test';

import type { AniZipEpisodeMap } from '@/lib/providers/mapping/anizip';
import { canonicalSeasonTitle } from './season-label';

function table(season: number, count: number, firstCanonical = 1): AniZipEpisodeMap {
  return new Map(
    Array.from({ length: count }, (_, index) => [
      index + 1,
      { season, number: firstCanonical + index },
    ]),
  );
}

describe('canonicalSeasonTitle (plan 0027 R8)', () => {
  test('a sequel entry renders its real season', () => {
    expect(canonicalSeasonTitle(table(2, 12))).toBe('Season 2');
  });

  test('a split-cour entry still names the season it belongs to', () => {
    // Mushoku Tensei S2 part 2: entry episode 1 is S02E13.
    expect(canonicalSeasonTitle(table(2, 12, 13))).toBe('Season 2');
  });

  test('a first-season entry renders "Season 1" only because it is one', () => {
    expect(canonicalSeasonTitle(table(1, 24))).toBe('Season 1');
  });

  test('a mapping miss falls back to neutral — never a guessed "Season 1"', () => {
    expect(canonicalSeasonTitle(null)).toBeNull();
    expect(canonicalSeasonTitle(undefined)).toBeNull();
    expect(canonicalSeasonTitle(new Map())).toBeNull();
  });

  test('an entry straddling two canonical seasons has no single header to show', () => {
    const straddling: AniZipEpisodeMap = new Map([
      ...table(2, 12),
      [13, { season: 3, number: 1 }],
    ]);
    expect(canonicalSeasonTitle(straddling)).toBeNull();
  });
});
