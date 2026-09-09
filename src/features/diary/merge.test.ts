import { describe, expect, test } from 'bun:test';

import type {
  MediaType,
  MergedDiaryEntry,
  NormalizedDiaryEntry,
  NormalizedMediaItem,
} from '@/types/media';
import type { ProviderId } from '@/lib/providers/types';
import {
  clusterDayEntries,
  formatClusterCount,
  formatDayHeader,
  formatDayParts,
  formatEpisodeDetail,
  formatLogTime,
  formatEpisodeRange,
  groupDiaryEntries,
  mergeDiaryEntries,
  shortClusterCount,
  summarizeCluster,
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

describe('formatDayParts', () => {
  const now = new Date('2026-07-21T12:00:00.000Z');
  test('the current local day labels itself "Today" and flags it', () => {
    expect(formatDayParts('2026-07-21', now, TZ_MINUS_5)).toEqual({
      day: '21',
      label: 'Today',
      isToday: true,
    });
  });
  test('a same-year day is a numeral over the short month', () => {
    expect(formatDayParts('2026-07-20', now, TZ_MINUS_5)).toEqual({
      day: '20',
      label: 'Jul',
      isToday: false,
    });
  });
  test('a prior-year day appends the two-digit year to the month', () => {
    expect(formatDayParts('2025-07-20', now, TZ_MINUS_5)).toEqual({
      day: '20',
      label: 'Jul 25',
      isToday: false,
    });
  });
});

describe('formatLogTime', () => {
  test('an instant renders as 24h local time in the given zone', () => {
    // 23:30Z is 18:30 at UTC-5 — the same conversion `has-aired` makes, so a
    // log never displays the origin zone's clock.
    expect(
      formatLogTime({ watchedAt: '2026-07-20T23:30:00.000Z', dateOnly: false }, TZ_MINUS_5),
    ).toBe('18:30');
  });
  test('a date-only entry has no time rather than a midnight', () => {
    expect(formatLogTime({ watchedAt: '2026-07-20', dateOnly: true }, TZ_MINUS_5)).toBe('');
  });
  test('an unparseable instant degrades to empty, never to NaN', () => {
    expect(formatLogTime({ watchedAt: 'not-a-date', dateOnly: false }, TZ_MINUS_5)).toBe('');
  });
});

describe('shortClusterCount', () => {
  test('a multi-episode run abbreviates to "eps"', () => {
    expect(shortClusterCount({ item: { type: 'TV' }, count: 10 })).toBe('10 eps');
  });
  test('a run that unions down to one episode says "ep", not "eps"', () => {
    // Two same-provider logs of the same episode (a rewatch) cluster together
    // but union to a single episode number.
    expect(shortClusterCount({ item: { type: 'ANIME' }, count: 1 })).toBe('1 ep');
  });
  test('manga counts chapters', () => {
    expect(shortClusterCount({ item: { type: 'MANGA' }, count: 4 })).toBe('4 ch');
  });
});

// --- Within-day episode clustering (presentation grouping) ---

function mergedEntry(
  overrides: Partial<MergedDiaryEntry> & { id: string },
): MergedDiaryEntry {
  return {
    providers: ['trakt'],
    item: item({ id: `${overrides.id}-item`, type: 'TV' }),
    episodes: [],
    watchedAt: '2026-07-20T12:00:00.000Z',
    dateOnly: false,
    ...overrides,
  };
}

// A same-show TV entry keyed by a shared tmdb id, so the identity matches.
function ep(id: string, season: number, episode: number): MergedDiaryEntry {
  return mergedEntry({
    id,
    item: item({ id: `${id}-item`, type: 'TV', externalIds: { tmdb: 555 } }),
    episodes: [episode],
    season,
  });
}

describe('clusterDayEntries', () => {
  test('a run of same-show episode logs folds into one cluster', () => {
    const clusters = clusterDayEntries([
      ep('e10', 6, 10),
      ep('e9', 6, 9),
      ep('e8', 6, 8),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].entries).toHaveLength(3);
    // Anchored at the first (newest) member's id.
    expect(clusters[0].key).toBe('e10');
  });

  test('a lone episode log stays a singleton cluster', () => {
    const clusters = clusterDayEntries([ep('solo', 1, 1)]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].entries).toHaveLength(1);
  });

  test('movies (no episodes) never fold, even same-title rewatches', () => {
    const movie = mergedEntry({
      id: 'm1',
      item: item({ id: 'fc', type: 'MOVIE', externalIds: { tmdb: 603 } }),
    });
    const rewatch = mergedEntry({
      id: 'm2',
      item: item({ id: 'fc2', type: 'MOVIE', externalIds: { tmdb: 603 } }),
    });
    const clusters = clusterDayEntries([movie, rewatch]);
    expect(clusters).toHaveLength(2);
  });

  test('different seasons of the same show do not fold together', () => {
    const clusters = clusterDayEntries([ep('s6', 6, 1), ep('s5', 5, 12)]);
    expect(clusters).toHaveLength(2);
  });

  test('same-show episodes interleaved with another show still fold, anchored at newest', () => {
    const other = mergedEntry({
      id: 'other',
      item: item({ id: 'ot', type: 'TV', externalIds: { tmdb: 999 } }),
      episodes: [1],
      season: 1,
    });
    const clusters = clusterDayEntries([ep('a', 6, 3), other, ep('b', 6, 2)]);
    // The show cluster anchors at its newest member (`a`), then the other row.
    expect(clusters.map((c) => c.key)).toEqual(['a', 'other']);
    expect(clusters[0].entries.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('summarizeCluster', () => {
  test('unions episodes and providers, counts distinct episodes', () => {
    const cluster = clusterDayEntries([
      mergedEntry({
        id: 'x',
        item: item({ id: 'x-item', type: 'TV', externalIds: { tmdb: 555 } }),
        episodes: [3],
        season: 6,
        providers: ['anilist'],
      }),
      mergedEntry({
        id: 'y',
        item: item({ id: 'y-item', type: 'TV', externalIds: { tmdb: 555 } }),
        episodes: [1, 2],
        season: 6,
        providers: ['trakt'],
      }),
    ])[0];
    const summary = summarizeCluster(cluster);
    expect(summary.episodes).toEqual([1, 2, 3]);
    expect(summary.count).toBe(3);
    expect(summary.season).toBe(6);
    // Precedence-ordered provider union, and the anchor (newest) item wins.
    expect(summary.providers).toEqual(['trakt', 'anilist']);
    expect(summary.item.id).toBe('x-item');
  });
});

describe('formatClusterCount', () => {
  test('episodes for TV/anime', () => {
    expect(formatClusterCount('TV', 10)).toBe('10 episodes');
    expect(formatClusterCount('ANIME', 1)).toBe('1 episode');
  });
  test('chapters for manga', () => {
    expect(formatClusterCount('MANGA', 12)).toBe('12 chapters');
  });
});

// --- Serializd (plan 0017 U7) ---
describe('Serializd diary in the unified merge', () => {
  const tvItem = (id: string) =>
    item({ id, title: 'Breaking Bad', type: 'TV', externalIds: { tmdb: 1396 } });

  test('a Serializd TV entry collapses with a same-day Trakt entry of the same show+episode', () => {
    const day = '2026-07-20T18:00:00.000Z';
    const trakt = entry('trakt', 't1', day, {
      episodes: [5],
      season: 1,
      item: tvItem('trakt-1396-item'),
    });
    const serializd = entry('serializd', 's1', day, {
      episodes: [5],
      season: 1,
      item: tvItem('serializd-1396'),
    });

    const days = groupDiaryEntries(
      mergeDiaryEntries([state('trakt', [trakt]), state('serializd', [serializd])]),
      TZ_MINUS_5,
    );

    expect(days).toHaveLength(1);
    const rows = days[0].entries;
    expect(rows).toHaveLength(1);
    // Both providers on one row (priority order) — two icons, one entry.
    expect(rows[0].providers).toEqual(['trakt', 'serializd']);
    expect(rows[0].episodes).toEqual([5]);
    expect(rows[0].season).toBe(1);
  });

  test('a failed Serializd read leaves the other providers rendered (partial failure)', () => {
    const trakt = entry('trakt', 't1', '2026-07-20T18:00:00.000Z');
    const merged = mergeDiaryEntries([
      state('trakt', [trakt]),
      state('serializd', [], { failed: true }),
    ]);
    expect(merged.map((e) => e.id)).toContain('trakt-t1');
  });

  test('entries group by dateAdded (watchedAt), so a backdated log surfaces on its page day (KTD8)', () => {
    // watchedAt carries dateAdded (KTD8): a log added on the 20th but backdated
    // to an old watch groups under the 20th — it surfaces when its page loads,
    // not at a chronological slot the merge can't reach.
    const recent = entry('serializd', 's-recent', '2026-07-20T18:00:00.000Z', {
      episodes: [5],
      season: 1,
      item: tvItem('serializd-1396'),
    });
    const older = entry('serializd', 's-older', '2026-07-10T18:00:00.000Z', {
      episodes: [1],
      season: 1,
      item: tvItem('serializd-1396'),
    });

    const days = groupDiaryEntries(
      mergeDiaryEntries([state('serializd', [recent, older])]),
      TZ_MINUS_5,
    );

    expect(days.map((d) => d.key)).toEqual(['2026-07-20', '2026-07-10']);
  });

  test('a season-level entry (no episodes) stays its own row, not collapsed with an episode log', () => {
    const day = '2026-07-20T18:00:00.000Z';
    const episodeLog = entry('serializd', 's-ep', day, {
      episodes: [5],
      season: 1,
      item: tvItem('serializd-1396'),
    });
    const seasonLog = entry('trakt', 't-season', day, {
      season: 1,
      item: tvItem('trakt-1396-item'),
    });

    const days = groupDiaryEntries(
      mergeDiaryEntries([state('serializd', [episodeLog]), state('trakt', [seasonLog])]),
      TZ_MINUS_5,
    );
    // Different episode signatures ([5] vs none) don't collapse.
    expect(days[0].entries).toHaveLength(2);
  });
});

describe('Simkl diary in the unified merge', () => {
  test('a Simkl anime entry collapses with a same-day AniList entry sharing only a mal/anilist id', () => {
    const day = '2026-07-31T18:00:00.000Z';
    const simkl = entry('simkl', '200-s1e5', day, {
      episodes: [5],
      item: item({
        id: 'simkl-200',
        title: 'KAMUI',
        type: 'ANIME',
        externalIds: { simkl: 200, mal: 999, anilist: 555 },
      }),
    });
    const anilist = entry('anilist', 'a1', day, {
      episodes: [5],
      item: item({
        id: 'anilist-555',
        title: 'KAMUI ---He is behind you',
        type: 'ANIME',
        // No tmdb — the pre-U9.5 tmdb/imdb/title join would miss this.
        externalIds: { anilist: 555 },
      }),
    });

    const days = groupDiaryEntries(
      mergeDiaryEntries([state('simkl', [simkl]), state('anilist', [anilist])]),
      TZ_MINUS_5,
    );

    expect(days).toHaveLength(1);
    const rows = days[0].entries;
    expect(rows).toHaveLength(1);
    expect(rows[0].providers).toEqual(['simkl', 'anilist']);
    // Simkl outranks AniList, so the display item is Simkl's.
    expect(rows[0].item.id).toBe('simkl-200');
    expect(rows[0].episodes).toEqual([5]);
  });

  test('a Simkl entry bridges a tmdb-only Serializd row and an anilist-only AniList row into one', () => {
    // Newest-first processing seats the id-rich Simkl entry as the bucket,
    // whose unioned keys then catch both id-poor contributors.
    const simkl = entry('simkl', '300-s1e4', '2026-07-31T18:00:02.000Z', {
      episodes: [4],
      item: item({
        id: 'simkl-300',
        title: 'Smoking Behind the Supermarket with You',
        type: 'TV',
        externalIds: { simkl: 300, tmdb: 777, anilist: 888 },
      }),
    });
    const serializd = entry('serializd', 's1', '2026-07-31T18:00:01.000Z', {
      episodes: [4],
      item: item({
        id: 'serializd-777',
        title: 'Smoking Behind the Supermarket with You',
        type: 'TV',
        externalIds: { tmdb: 777 },
      }),
    });
    const anilist = entry('anilist', 'a1', '2026-07-31T18:00:00.000Z', {
      episodes: [4],
      item: item({
        id: 'anilist-888',
        title: 'Kimi to Boku no Saigo no Senjou',
        type: 'TV',
        externalIds: { anilist: 888 },
      }),
    });

    const days = groupDiaryEntries(
      mergeDiaryEntries([
        state('simkl', [simkl]),
        state('serializd', [serializd]),
        state('anilist', [anilist]),
      ]),
      TZ_MINUS_5,
    );

    expect(days).toHaveLength(1);
    const rows = days[0].entries;
    expect(rows).toHaveLength(1);
    expect(rows[0].providers).toEqual(['simkl', 'serializd', 'anilist']);
  });

  test('two Simkl logs of one show never collapse with each other (same-provider rule)', () => {
    const day = '2026-07-31T18:00:00.000Z';
    const shared = () =>
      item({ id: 'simkl-200', type: 'ANIME', externalIds: { mal: 999 } });
    const e4 = entry('simkl', '200-s1e4', day, { episodes: [4], item: shared() });
    const e5 = entry('simkl', '200-s1e5', day, { episodes: [5], item: shared() });

    const days = groupDiaryEntries(
      mergeDiaryEntries([state('simkl', [e4, e5])]),
      TZ_MINUS_5,
    );
    expect(days[0].entries).toHaveLength(2);
  });

  test('id-bearing items never fall back to a title+year join', () => {
    const day = '2026-07-31T18:00:00.000Z';
    const simkl = entry('simkl', 'm1', day, {
      item: item({
        id: 'simkl-1',
        title: 'Solaris',
        year: 1972,
        externalIds: { simkl: 1, tmdb: 593 },
      }),
    });
    // Same title+year, different film (the 2002 remake mis-dated) — a shared
    // title must not merge items whose ids disagree.
    const letterboxd = entry('letterboxd', 'l1', day, {
      item: item({
        id: 'letterboxd-solaris-2002',
        title: 'Solaris',
        year: 1972,
        externalIds: { tmdb: 2721 },
      }),
    });

    const days = groupDiaryEntries(
      mergeDiaryEntries([state('simkl', [simkl]), state('letterboxd', [letterboxd])]),
      TZ_MINUS_5,
    );
    expect(days[0].entries).toHaveLength(2);
  });
});
