import { describe, expect, test } from 'bun:test';

import type {
  MediaType,
  NormalizedDiaryEntry,
  NormalizedMediaItem,
} from '@/types/media';
import type { ProviderId } from '@/lib/providers/types';
import {
  formatDayHeader,
  formatEpisodeDetail,
  formatEpisodeRange,
  groupDiaryEntries,
  mergeDiaryEntries,
  watermarkProviders,
  type DiaryProviderState,
} from './merge';

// UTC−05:00 year-round (no DST) — the fixed offset AE4 specifies.
const TZ_MINUS_5 = 'Etc/GMT+5';

function item(
  overrides: Partial<NormalizedMediaItem> & { id: string },
): NormalizedMediaItem {
  return {
    title: 'Untitled',
    coverImage: '',
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-20T00:00:00.000Z',
    externalIds: {},
    ...overrides,
  };
}

function entry(
  provider: ProviderId,
  logId: string,
  watchedAt: string,
  overrides: Partial<NormalizedDiaryEntry> = {},
): NormalizedDiaryEntry {
  return {
    id: `${provider}-${logId}`,
    provider,
    watchedAt,
    item: item({ id: `${provider}-${logId}-item` }),
    ...overrides,
  };
}

function state(
  provider: ProviderId,
  entries: NormalizedDiaryEntry[],
  options: { hasMore?: boolean; failed?: boolean } = {},
): DiaryProviderState {
  return {
    provider,
    entries,
    hasMore: options.hasMore ?? false,
    failed: options.failed ?? false,
  };
}

describe('mergeDiaryEntries — watermark', () => {
  const traktOld = [
    entry('trakt', '1', '2026-07-01T12:00:00.000Z'),
    entry('trakt', '2', '2026-07-05T12:00:00.000Z'),
  ];
  const anilistNew = [
    entry('anilist', '1', '2026-07-10T12:00:00.000Z'),
    entry('anilist', '2', '2026-07-15T12:00:00.000Z'),
  ];

  test('holds back entries older than a still-paginating provider', () => {
    const merged = mergeDiaryEntries([
      state('trakt', traktOld, { hasMore: false }),
      state('anilist', anilistNew, { hasMore: true }),
    ]);
    // Watermark = AniList's oldest loaded (July 10); Trakt's July 1/5 are older.
    expect(merged.map((e) => e.id)).toEqual(['anilist-2', 'anilist-1']);
  });

  test('releases the held-back entries once the provider exhausts', () => {
    const merged = mergeDiaryEntries([
      state('trakt', traktOld, { hasMore: false }),
      state('anilist', anilistNew, { hasMore: false }),
    ]);
    expect(merged).toHaveLength(4);
    expect(merged[0].id).toBe('anilist-2');
    expect(merged[3].id).toBe('trakt-1');
  });

  test('a single paginating provider degenerates to plain pagination', () => {
    const merged = mergeDiaryEntries([
      state(
        'trakt',
        [
          entry('trakt', '1', '2026-07-10T12:00:00.000Z'),
          entry('trakt', '2', '2026-07-01T12:00:00.000Z'),
        ],
        { hasMore: true },
      ),
    ]);
    // Watermark = its own oldest → everything loaded shows, newest first.
    expect(merged.map((e) => e.id)).toEqual(['trakt-1', 'trakt-2']);
  });
});

describe('mergeDiaryEntries — failure & dedup', () => {
  test('a failed provider is excluded from the watermark; others render (AE2)', () => {
    const merged = mergeDiaryEntries([
      state('trakt', [entry('trakt', '1', '2026-07-10T12:00:00.000Z')], {
        hasMore: false,
      }),
      // AniList failed with nothing loaded — must not hold Trakt back.
      state('anilist', [], { hasMore: false, failed: true }),
    ]);
    expect(merged.map((e) => e.id)).toEqual(['trakt-1']);
  });

  test('every provider failing yields zero entries (AE5 substrate)', () => {
    const merged = mergeDiaryEntries([
      state('trakt', [], { hasMore: false, failed: true }),
      state('anilist', [], { hasMore: false, failed: true }),
    ]);
    expect(merged).toEqual([]);
  });

  test('an entry re-returned on an overlapping page is not duplicated', () => {
    const shared = entry('trakt', '5', '2026-07-10T12:00:00.000Z');
    const merged = mergeDiaryEntries([
      state(
        'trakt',
        [
          entry('trakt', '6', '2026-07-11T12:00:00.000Z'),
          shared,
          // page N+1 re-returns the tail of page N after a prepend.
          shared,
        ],
        { hasMore: false },
      ),
    ]);
    expect(merged.filter((e) => e.id === 'trakt-5')).toHaveLength(1);
  });
});

describe('watermarkProviders', () => {
  test('routes fetchNextPage to the provider sitting at the watermark', () => {
    const providers = watermarkProviders([
      state('trakt', [entry('trakt', '1', '2026-07-01T00:00:00.000Z')], {
        hasMore: false,
      }),
      state('anilist', [entry('anilist', '1', '2026-07-10T00:00:00.000Z')], {
        hasMore: true,
      }),
      state('letterboxd', [entry('letterboxd', '1', '2026-07-12T00:00:00.000Z')], {
        hasMore: true,
      }),
    ]);
    // Letterboxd's oldest (July 12) is the newest oldest-loaded → it advances.
    expect(providers).toEqual(['letterboxd']);
  });

  test('cold-start providers with nothing loaded yet all advance', () => {
    const providers = watermarkProviders([
      state('trakt', [], { hasMore: true }),
      state('anilist', [], { hasMore: true }),
    ]);
    expect(providers.sort()).toEqual(['anilist', 'trakt']);
  });
});

describe('groupDiaryEntries — cross-provider collapse', () => {
  test('AE1: same tmdb film, same local day, two providers → one row', () => {
    const merged = mergeDiaryEntries([
      state('trakt', [
        entry('trakt', '100', '2026-07-20T18:30:00.000Z', {
          item: item({ id: 'trakt-603', title: 'Fight Club', externalIds: { tmdb: 603, trakt: 550 } }),
        }),
      ]),
      state('letterboxd', [
        entry('letterboxd', 'g1', '2026-07-20', {
          dateOnly: true,
          item: item({ id: 'letterboxd-fight-club', title: 'Fight Club', externalIds: { tmdb: 603, letterboxd: 'fight-club' } }),
        }),
      ]),
    ]);
    const days = groupDiaryEntries(merged, TZ_MINUS_5);
    expect(days).toHaveLength(1);
    expect(days[0].entries).toHaveLength(1);
    const row = days[0].entries[0];
    expect(row.providers).toEqual(['trakt', 'letterboxd']);
    expect(row.episodes).toEqual([]);
    // The merged item cross-links both providers' ids; Trakt (richer) is primary.
    expect(row.id).toBe('trakt-100');
    expect(row.item.externalIds.tmdb).toBe(603);
    expect(row.item.externalIds.letterboxd).toBe('fight-club');
  });

  test('AE6: three same-day Trakt episodes → three rows', () => {
    const show = { id: 'trakt-200', title: 'Monogatari', type: 'TV' as MediaType, externalIds: { tmdb: 46004 } };
    const merged = mergeDiaryEntries([
      state('trakt', [
        entry('trakt', 'a', '2026-07-20T20:00:00.000Z', { item: item(show), episodes: [1], season: 2 }),
        entry('trakt', 'b', '2026-07-20T21:00:00.000Z', { item: item(show), episodes: [2], season: 2 }),
        entry('trakt', 'c', '2026-07-20T22:00:00.000Z', { item: item(show), episodes: [3], season: 2 }),
      ]),
    ]);
    const days = groupDiaryEntries(merged, TZ_MINUS_5);
    expect(days[0].entries).toHaveLength(3);
  });

  test('AE6: two same-day Trakt logs of one movie (rewatch) → two rows', () => {
    const movie = { id: 'trakt-603', title: 'Fight Club', externalIds: { tmdb: 603 } };
    const merged = mergeDiaryEntries([
      state('trakt', [
        entry('trakt', 'x', '2026-07-20T14:00:00.000Z', { item: item(movie) }),
        entry('trakt', 'y', '2026-07-20T22:00:00.000Z', { item: item(movie) }),
      ]),
    ]);
    const days = groupDiaryEntries(merged, TZ_MINUS_5);
    expect(days[0].entries).toHaveLength(2);
  });

  test('cross-provider entries with mismatched episode sets do not merge', () => {
    const merged = mergeDiaryEntries([
      state('trakt', [
        entry('trakt', 'e', '2026-07-20T20:00:00.000Z', {
          item: item({ id: 'trakt-1', title: 'Frieren', type: 'ANIME', externalIds: { tmdb: 209867 } }),
          episodes: [3],
        }),
      ]),
      state('anilist', [
        entry('anilist', 'e', '2026-07-20T20:00:00.000Z', {
          item: item({ id: 'anilist-1', title: 'Frieren', type: 'ANIME', externalIds: { tmdb: 209867 } }),
          episodes: [3, 4, 5],
        }),
      ]),
    ]);
    const days = groupDiaryEntries(merged, TZ_MINUS_5);
    expect(days[0].entries).toHaveLength(2);
  });

  test('identity fallback: matching title+year merges, different year does not', () => {
    const traktEntry = entry('trakt', 'h', '2026-07-20T18:00:00.000Z', {
      item: item({ id: 'trakt-1', title: 'Heat', year: 1995, externalIds: { trakt: 1 } }),
    });
    const letterboxdSame = entry('letterboxd', 'h', '2026-07-20', {
      dateOnly: true,
      item: item({ id: 'letterboxd-heat', title: 'Heat', year: 1995, externalIds: { letterboxd: 'heat' } }),
    });
    const mergedSame = groupDiaryEntries(
      mergeDiaryEntries([state('trakt', [traktEntry]), state('letterboxd', [letterboxdSame])]),
      TZ_MINUS_5,
    );
    expect(mergedSame[0].entries).toHaveLength(1);

    const letterboxdDiffYear = entry('letterboxd', 'h2', '2026-07-20', {
      dateOnly: true,
      item: item({ id: 'letterboxd-heat-96', title: 'Heat', year: 1996, externalIds: { letterboxd: 'heat-96' } }),
    });
    const mergedDiff = groupDiaryEntries(
      mergeDiaryEntries([state('trakt', [traktEntry]), state('letterboxd', [letterboxdDiffYear])]),
      TZ_MINUS_5,
    );
    expect(mergedDiff[0].entries).toHaveLength(2);
  });

  test('the same item on different local days does not merge', () => {
    const merged = mergeDiaryEntries([
      state('trakt', [entry('trakt', '1', '2026-07-20T18:00:00.000Z', { item: item({ id: 'trakt-603', externalIds: { tmdb: 603 } }) })]),
      state('letterboxd', [entry('letterboxd', 'g', '2026-07-19', { dateOnly: true, item: item({ id: 'letterboxd-x', externalIds: { tmdb: 603 } }) })]),
    ]);
    const days = groupDiaryEntries(merged, TZ_MINUS_5);
    expect(days).toHaveLength(2);
    expect(days.every((day) => day.entries.length === 1)).toBe(true);
  });
});

describe('groupDiaryEntries — timezone & ordering', () => {
  test('AE4: a UTC-evening instant groups into the previous local day', () => {
    const merged = mergeDiaryEntries([
      state('trakt', [entry('trakt', '1', '2026-07-20T23:30:00.000Z')]),
    ]);
    const days = groupDiaryEntries(merged, TZ_MINUS_5);
    // 23:30Z − 5h = 18:30 local on July 20, not July 21.
    expect(days[0].key).toBe('2026-07-20');
  });

  test('a date-only entry sorts after instant entries within the same day', () => {
    const merged = mergeDiaryEntries([
      state('letterboxd', [entry('letterboxd', 'g', '2026-07-20', { dateOnly: true, item: item({ id: 'letterboxd-a', externalIds: { tmdb: 1 } }) })]),
      state('trakt', [entry('trakt', '1', '2026-07-20T09:00:00.000Z', { item: item({ id: 'trakt-b', externalIds: { tmdb: 2 } }) })]),
    ]);
    const days = groupDiaryEntries(merged, TZ_MINUS_5);
    expect(days[0].entries.map((e) => e.providers[0])).toEqual(['trakt', 'letterboxd']);
  });

  test('a date-only watermark never cuts same-day instant entries', () => {
    const merged = mergeDiaryEntries([
      // Letterboxd still paginating, oldest is a July 20 date-only entry.
      state('letterboxd', [entry('letterboxd', 'g', '2026-07-20', { dateOnly: true })], { hasMore: true }),
      // A Trakt instant safely inside July 20 (20:00Z) must not be cut.
      state('trakt', [entry('trakt', '1', '2026-07-20T20:00:00.000Z')], { hasMore: false }),
    ]);
    expect(merged.some((e) => e.id === 'trakt-1')).toBe(true);
  });
});

describe('formatEpisodeRange', () => {
  test('a contiguous run renders as an en-dash range', () => {
    expect(formatEpisodeRange([3, 4, 5])).toBe('3–5');
  });
  test('a gap renders as a comma list', () => {
    expect(formatEpisodeRange([2, 5])).toBe('2, 5');
  });
  test('mixed runs and singles', () => {
    expect(formatEpisodeRange([1, 2, 3, 7, 9, 10])).toBe('1–3, 7, 9–10');
  });
  test('empty → empty string', () => {
    expect(formatEpisodeRange([])).toBe('');
  });
});

describe('formatEpisodeDetail', () => {
  test('TV episode with a season', () => {
    expect(formatEpisodeDetail({ type: 'TV', season: 2, episodes: [5] })).toBe('S2E5');
  });
  test('anime episodes without a season', () => {
    expect(formatEpisodeDetail({ type: 'ANIME', episodes: [3, 4, 5] })).toBe('Ep 3–5');
  });
  test('manga chapters', () => {
    expect(formatEpisodeDetail({ type: 'MANGA', episodes: [41] })).toBe('Ch 41');
  });
  test('a movie has no detail line', () => {
    expect(formatEpisodeDetail({ type: 'MOVIE', episodes: [] })).toBe('');
  });
});

describe('formatDayHeader', () => {
  const now = new Date('2026-07-21T12:00:00.000Z');
  test('the current local day reads "Today"', () => {
    expect(formatDayHeader('2026-07-21', now, TZ_MINUS_5)).toBe('Today');
  });
  test('a same-year day omits the year', () => {
    expect(formatDayHeader('2026-07-20', now, TZ_MINUS_5)).toBe('July 20');
  });
  test('a prior-year day appends the year', () => {
    expect(formatDayHeader('2025-07-20', now, TZ_MINUS_5)).toBe('July 20, 2025');
  });
});
