import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { SerializdDeps } from './deps';
import { isYearBasedSeason, resolveSeasonId } from './season-id';

function deps(response: Response): SerializdDeps {
  return { baseUrl: 'https://api.test', fetch: async () => response };
}

describe('isYearBasedSeason', () => {
  test('flags calendar-year season numbers as permanently unmappable', () => {
    expect(isYearBasedSeason(2019)).toBe(true);
    expect(isYearBasedSeason(2000)).toBe(true);
    expect(isYearBasedSeason(1)).toBe(false);
    expect(isYearBasedSeason(42)).toBe(false);
  });
});

describe('resolveSeasonId', () => {
  test('returns the seasonId when Serializd has the season', async () => {
    const seasonId = await Effect.runPromise(
      resolveSeasonId(deps(Response.json({ seasonId: 555, episodes: [] })), {
        tmdbId: 1396,
        seasonNumber: 1,
      }),
    );
    expect(seasonId).toBe(555);
  });

  test('a seasonId:null body is a transient miss (null, not an error)', async () => {
    const seasonId = await Effect.runPromise(
      resolveSeasonId(deps(Response.json({ seasonId: null })), {
        tmdbId: 1396,
        seasonNumber: 9,
      }),
    );
    expect(seasonId).toBeNull();
  });

  test('a 404 for an as-yet-unlisted season is a miss, not an error', async () => {
    const seasonId = await Effect.runPromise(
      resolveSeasonId(deps(new Response('not found', { status: 404 })), {
        tmdbId: 1396,
        seasonNumber: 9,
      }),
    );
    expect(seasonId).toBeNull();
  });
});
