import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { SerializdDeps } from './deps';
import { diaryHasEpisode, getSerializdDiary, serializdNextPage } from './diary';
import { normalizeDiaryReview, type SerializdDiaryReview } from './normalize';

function deps(payload: unknown): SerializdDeps {
  return {
    baseUrl: 'https://api.test',
    session: { accessToken: 'tok', username: 'gian' },
    fetch: async () => Response.json(payload),
  };
}

const review = (over: Partial<SerializdDiaryReview> = {}): SerializdDiaryReview => ({
  reviewId: 1,
  showId: 1396,
  seasonId: 555,
  seasonName: 'Season 1',
  episodeNumber: 5,
  dateAdded: '2026-07-15T20:00:00.000Z',
  backdate: '2026-07-15T20:00:00.000Z',
  showName: 'Breaking Bad',
  ...over,
});

describe('getSerializdDiary', () => {
  test('maps reviews[] to diary entries with a tmdb id and a stable review-based id', async () => {
    const page = await Effect.runPromise(
      getSerializdDiary(deps({ reviews: [review()], totalPages: 3 }), { page: 1 }),
    );
    expect(page.totalPages).toBe(3);
    expect(page.entries).toHaveLength(1);
    const [entry] = page.entries;
    expect(entry.id).toBe('serializd-1');
    expect(entry.provider).toBe('serializd');
    expect(entry.item.externalIds.tmdb).toBe(1396);
    expect(entry.item.type).toBe('TV');
    // KTD8: ordering/grouping keys on dateAdded, so watchedAt carries it.
    expect(entry.watchedAt).toBe('2026-07-15T20:00:00.000Z');
    expect(entry.episodes).toEqual([5]);
    expect(entry.season).toBe(1);
  });

  test('a missing session username is a dead session, not an empty diary', async () => {
    const bad: SerializdDeps = {
      baseUrl: 'https://api.test',
      session: { accessToken: 'tok', username: '' },
      fetch: async () => Response.json({ reviews: [] }),
    };
    const error = await Effect.runPromise(Effect.flip(getSerializdDiary(bad, { page: 1 })));
    expect(error._tag).toBe('ProviderAuthError');
  });
});

describe('serializdNextPage', () => {
  test('page 1 of 3 advances to 2; the last page has no successor', () => {
    expect(serializdNextPage({ entries: [], totalPages: 3 }, 1)).toBe(2);
    expect(serializdNextPage({ entries: [], totalPages: 3 }, 3)).toBeUndefined();
  });
});

describe('normalizeDiaryReview', () => {
  test('two same-day logs of the same episode keep distinct ids (no dedup collision)', () => {
    const a = normalizeDiaryReview(review({ reviewId: 10 }), 'now');
    const b = normalizeDiaryReview(review({ reviewId: 11 }), 'now');
    expect(a.id).not.toBe(b.id);
  });

  test('synthesizes a unique id when no review id is present', () => {
    const entry = normalizeDiaryReview(
      review({ reviewId: undefined, id: undefined }),
      'now',
    );
    expect(entry.id).toBe('serializd:1396:555:5:2026-07-15T20:00:00.000Z');
  });

  test('a season-level entry normalizes without episode detail', () => {
    const entry = normalizeDiaryReview(
      review({ episodeNumber: undefined, seasonName: 'Season 2' }),
      'now',
    );
    expect(entry.episodes).toBeUndefined();
    expect(entry.season).toBe(2);
  });
});

describe('diaryHasEpisode', () => {
  test('finds a logged episode and rejects an unlogged one (R12)', () => {
    const entries = [normalizeDiaryReview(review({ episodeNumber: 5 }), 'now')];
    expect(diaryHasEpisode(entries, { tmdbId: 1396, episodeNumber: 5 })).toBe(true);
    expect(diaryHasEpisode(entries, { tmdbId: 1396, episodeNumber: 6 })).toBe(false);
    expect(diaryHasEpisode(entries, { tmdbId: 999, episodeNumber: 5 })).toBe(false);
  });
});
