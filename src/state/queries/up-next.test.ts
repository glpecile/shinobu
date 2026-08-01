import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, mock, test } from 'bun:test';

import type { AniListCurrentEntry } from '@/lib/providers/anilist/normalize';
import type {
  TraktCalendarEpisode,
  TraktCalendarRelease,
  TraktShowProgressResult,
} from '@/lib/providers/trakt/normalize';
import type { NormalizedMediaItem } from '@/types/media';

// Import-time stubs only: MMKV, the native fetch client and react-native's
// entry point don't load under bun. Nothing the slot *does* is mocked — the
// provider seam is the query client itself (see `fakeClient`), which keeps
// these module mocks from leaking real behavior into other suites.
const store = new Map<string, string>();
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => store.get(key),
    set: (key: string, value: string) => store.set(key, value),
    remove: (key: string) => store.delete(key),
    getAllKeys: () => [...store.keys()],
    addOnValueChangedListener: () => ({ remove() {} }),
  }),
}));
mock.module('@/lib/http/client', () => ({
  httpFetch: async () => new Response('{}'),
}));
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web },
}));
// `./up-next` imports `./mapping`, which imports `./simkl` (plan 0034 U7),
// whose auth re-export reaches expo-crypto — mirror the surface it consumes
// instead of loading the whole expo package under bun (the
// `state/queries/simkl.test.ts` pattern).
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));

const { fetchUpNextInputs, upNextQueryKeys } = await import('./up-next');

function show(traktId: number, lastUpdated: string): NormalizedMediaItem {
  return {
    id: `trakt-${traktId}`,
    title: `Show ${traktId}`,
    coverImage: '',
    type: 'TV',
    currentProgress: 1,
    progressUnit: 'episode',
    lastUpdated,
    externalIds: { trakt: traktId },
  };
}

function animeEntry(anilistId: number): AniListCurrentEntry {
  return {
    item: {
      id: `anilist-${anilistId}`,
      title: `Anime ${anilistId}`,
      coverImage: '',
      type: 'ANIME',
      currentProgress: 3,
      progressUnit: 'episode',
      lastUpdated: '2026-07-21T00:00:00.000Z',
      externalIds: { anilist: anilistId },
    },
    // The widened list read carries PLANNING entries too (plan 0030 R12); this
    // slot only forwards them, so the status the gate reads travels with the
    // entry rather than being re-derived downstream.
    status: 'CURRENT',
    nextAiring: null,
    totalEpisodes: 12,
  };
}

function movie(traktId: number): NormalizedMediaItem {
  return {
    id: `trakt-${traktId}`,
    title: `Film ${traktId}`,
    coverImage: '',
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-20T00:00:00.000Z',
    externalIds: { trakt: traktId },
  };
}

const PROGRESS: TraktShowProgressResult = {
  watchedKeys: new Set<string>(),
  nextEpisode: { season: 1, number: 2, firstAired: '2026-07-22T00:00:00.000Z' },
};

/** Trakt's calendar segment — the key's third element (`myCalendar`). */
type CalendarType = 'shows' | 'movies' | 'streaming' | 'dvd';

interface Scenario {
  shows?: NormalizedMediaItem[];
  anime?: AniListCurrentEntry[];
  /** `/calendars/my/shows` rows — Calendar's Trakt half (plan 0030 KTD-2). */
  calendarShows?: TraktCalendarEpisode[];
  /** Per-calendar movie rows, keyed by Trakt's segment name. */
  calendarMovies?: Partial<Record<CalendarType, TraktCalendarRelease[]>>;
  /** Providers whose top-level read rejects. */
  failing?: Array<'trakt' | 'anilist'>;
  /** Trakt ids whose per-show progress read rejects. */
  failingProgress?: number[];
  /** Calendars whose read rejects — each settles on its own (R7). */
  failingCalendars?: CalendarType[];
}

/**
 * Every provider read reaches the network through `queryClient.fetchQuery`, so
 * a client that answers by query key is the whole seam — no module mocking, and
 * each cached read is observable (that is how the pool cap is asserted).
 */
function fakeClient(scenario: Scenario) {
  const progressRequests: number[] = [];
  const calendarKeys: unknown[][] = [];
  const fetchQuery = async ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const [root, kind, id] = queryKey as [string, string, number];
    if (root === 'trakt' && kind === 'my-calendar') {
      const type = queryKey[2] as CalendarType;
      calendarKeys.push([...queryKey]);
      if (scenario.failingCalendars?.includes(type) === true) {
        throw new Error(`${type} calendar down`);
      }
      return type === 'shows'
        ? (scenario.calendarShows ?? [])
        : (scenario.calendarMovies?.[type] ?? []);
    }
    if (root === 'trakt' && kind === 'watched-shows') {
      if (scenario.failing?.includes('trakt') === true) {
        throw new Error('watched shows down');
      }
      return scenario.shows ?? [];
    }
    if (root === 'trakt' && kind === 'show-progress') {
      progressRequests.push(id);
      if (scenario.failingProgress?.includes(id) === true) {
        throw new Error(`progress ${id} down`);
      }
      return PROGRESS;
    }
    if (root === 'anilist' && kind === 'current-anime-entries') {
      if (scenario.failing?.includes('anilist') === true) {
        throw new Error('anilist down');
      }
      return scenario.anime ?? [];
    }
    if (root === 'mapping') return null; // ani.zip miss — dedupe is best-effort
    // Letterboxd's release resolve — including its own settle — is exercised in
    // `letterboxd.test.ts`; here an empty watchlist is enough to prove the
    // source is wired into the fan without disturbing the others.
    if (root === 'letterboxd' && kind === 'watchlist') return [];
    throw new Error(`unexpected query: ${queryKey.join('/')}`);
  };
  return {
    client: { fetchQuery } as unknown as QueryClient,
    progressRequests,
    calendarKeys,
  };
}

describe('fetchUpNextInputs', () => {
  test('Trakt-only: AniList being disconnected is absence, not an error', async () => {
    const { client } = fakeClient({ shows: [show(1, '2026-07-20T00:00:00.000Z')] });

    const inputs = await fetchUpNextInputs(client, ['trakt']);

    expect(inputs.trakt).toHaveLength(1);
    expect(inputs.trakt[0].nextEpisode?.number).toBe(2);
    expect(inputs.anilist).toEqual([]);
    expect(inputs.errors).toEqual([]);
  });

  test('one show’s progress failing omits that show, not the rest', async () => {
    const { client } = fakeClient({
      shows: [
        show(1, '2026-07-20T00:00:00.000Z'),
        show(2, '2026-07-19T00:00:00.000Z'),
        show(3, '2026-07-18T00:00:00.000Z'),
      ],
      failingProgress: [2],
    });

    const inputs = await fetchUpNextInputs(client, ['trakt']);

    expect(inputs.trakt.map((input) => input.item.externalIds.trakt)).toEqual([
      1, 3,
    ]);
    // A single failed show is not a slot-level failure.
    expect(inputs.errors).toEqual([]);
  });

  test('the pool caps the per-show request fan (R6/KTD-2)', async () => {
    const { client, progressRequests } = fakeClient({
      shows: Array.from({ length: 25 }, (_, index) =>
        show(
          index + 1,
          `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
        ),
      ),
    });

    await fetchUpNextInputs(client, ['trakt']);

    expect(progressRequests).toHaveLength(20);
    // Most recently watched first — show 25 is in, show 1 is not.
    expect(progressRequests).toContain(25);
    expect(progressRequests).not.toContain(1);
  });

  test('a failed provider surfaces as an error while the other still returns', async () => {
    const { client } = fakeClient({
      failing: ['trakt'],
      anime: [animeEntry(1)],
    });

    const inputs = await fetchUpNextInputs(client, ['trakt', 'anilist']);

    expect(inputs.anilist).toHaveLength(1);
    expect(inputs.trakt).toEqual([]);
    expect(inputs.errors).toEqual([
      { provider: 'trakt', message: 'watched shows down' },
    ]);
  });

  test('both providers failing degrades to empty inputs with both errors', async () => {
    const { client } = fakeClient({ failing: ['trakt', 'anilist'] });

    const inputs = await fetchUpNextInputs(client, ['trakt', 'anilist']);

    expect(inputs.errors.map((error) => error.provider)).toEqual([
      'trakt',
      'anilist',
    ]);
    expect(inputs.trakt).toEqual([]);
    expect(inputs.anilist).toEqual([]);
  });

  test('an unresolvable ani.zip mapping leaves the entry without a TMDB id', async () => {
    const { client } = fakeClient({ shows: [], anime: [animeEntry(7)] });

    const inputs = await fetchUpNextInputs(client, ['trakt', 'anilist']);

    expect(inputs.anilist).toHaveLength(1);
    expect(inputs.anilist[0].tmdbId).toBeUndefined();
  });

  test('no read-capable provider connected → empty inputs, no requests', async () => {
    const { client, progressRequests, calendarKeys } = fakeClient({});

    const inputs = await fetchUpNextInputs(client, []);

    expect(inputs).toEqual({
      trakt: [],
      traktCalendar: [],
      releases: [],
      anilist: [],
      errors: [],
    });
    expect(progressRequests).toHaveLength(0);
    expect(calendarKeys).toHaveLength(0);
  });
});

describe('fetchUpNextInputs — the my-calendars sources (U4/U5)', () => {
  const airing: TraktCalendarEpisode = {
    item: show(9, '2026-07-20T00:00:00.000Z'),
    episode: { season: 1, number: 1, firstAired: '2026-07-25T20:00:00.000Z' },
  };

  test('Calendar reads the shows calendar alongside — not instead of — the pool', async () => {
    const { client } = fakeClient({
      shows: [show(1, '2026-07-20T00:00:00.000Z')],
      calendarShows: [airing],
    });

    const inputs = await fetchUpNextInputs(client, ['trakt']);

    // Continue Watching's fan is untouched by the new source (R4).
    expect(inputs.trakt).toHaveLength(1);
    expect(inputs.traktCalendar).toEqual([airing]);
  });

  test('theatrical and digital come from two calendars, tagged by source', async () => {
    const { client, calendarKeys } = fakeClient({
      calendarMovies: {
        movies: [{ item: movie(10), kind: 'theatrical', date: '2026-07-24' }],
        streaming: [{ item: movie(11), kind: 'digital', date: '2026-07-26' }],
      },
    });

    const inputs = await fetchUpNextInputs(client, ['trakt']);

    expect(inputs.releases).toEqual([
      { item: movie(10), kind: 'theatrical', date: '2026-07-24', source: 'trakt' },
      { item: movie(11), kind: 'digital', date: '2026-07-26', source: 'trakt' },
    ]);
    // Physical isn't requested in v1 — no row renders it (R3).
    expect(calendarKeys.map((key) => key[2])).toEqual([
      'shows',
      'movies',
      'streaming',
    ]);
  });

  test('the calendar key carries the local start date and the 7-day window', async () => {
    const { client, calendarKeys } = fakeClient({});

    await fetchUpNextInputs(client, ['trakt']);

    // Keyed by the local day so the cached week rolls over at local midnight
    // rather than serving yesterday's window to an app left open overnight.
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (const key of calendarKeys) {
      expect(key[3]).toBe(expected);
      expect(key[4]).toBe(7);
    }
  });

  test('a failing calendar degrades only itself, never Continue Watching', async () => {
    const { client } = fakeClient({
      shows: [show(1, '2026-07-20T00:00:00.000Z')],
      calendarMovies: {
        streaming: [{ item: movie(12), kind: 'digital', date: '2026-07-26' }],
      },
      failingCalendars: ['shows'],
    });

    const inputs = await fetchUpNextInputs(client, ['trakt']);

    expect(inputs.trakt).toHaveLength(1);
    expect(inputs.traktCalendar).toEqual([]);
    expect(inputs.releases).toHaveLength(1);
    expect(inputs.errors).toEqual([
      { provider: 'trakt', message: 'shows calendar down' },
    ]);
  });

  test('Letterboxd joins the same releases array without disturbing Trakt’s', async () => {
    // Both watchlist sources feed one array on purpose (KTD-6): dedupe can only
    // collapse a film watchlisted in both places if the rows sit together.
    const { client } = fakeClient({
      calendarMovies: {
        movies: [{ item: movie(13), kind: 'theatrical', date: '2026-07-29' }],
      },
    });

    const inputs = await fetchUpNextInputs(client, ['trakt', 'letterboxd']);

    expect(inputs.releases).toEqual([
      { item: movie(13), kind: 'theatrical', date: '2026-07-29', source: 'trakt' },
    ]);
    expect(inputs.errors).toEqual([]);
  });

  test('the streaming calendar failing keeps the theatrical rows (R7)', async () => {
    // `/calendars/my/streaming` is the one path plan 0030 could not confirm
    // against an authed response (docs/solutions/trakt-streaming-calendar-path.md),
    // so it is precisely the read that must not be able to take another one
    // with it — the two movie calendars settle separately for that reason.
    const { client } = fakeClient({
      calendarShows: [airing],
      calendarMovies: {
        movies: [{ item: movie(14), kind: 'theatrical', date: '2026-07-30' }],
      },
      failingCalendars: ['streaming'],
    });

    const inputs = await fetchUpNextInputs(client, ['trakt']);

    expect(inputs.traktCalendar).toEqual([airing]);
    expect(inputs.releases).toEqual([
      { item: movie(14), kind: 'theatrical', date: '2026-07-30', source: 'trakt' },
    ]);
    expect(inputs.errors).toEqual([
      { provider: 'trakt', message: 'streaming calendar down' },
    ]);
  });

  test('the theatrical calendar failing keeps the streaming rows', async () => {
    const { client } = fakeClient({
      calendarMovies: {
        streaming: [{ item: movie(15), kind: 'digital', date: '2026-08-01' }],
      },
      failingCalendars: ['movies'],
    });

    const inputs = await fetchUpNextInputs(client, ['trakt']);

    expect(inputs.releases).toEqual([
      { item: movie(15), kind: 'digital', date: '2026-08-01', source: 'trakt' },
    ]);
    expect(inputs.errors).toEqual([
      { provider: 'trakt', message: 'movies calendar down' },
    ]);
  });

  test('every Trakt read failing at once still returns one error each, no throw', async () => {
    // The section degrades to empty; it never rejects, which is what would blank
    // the whole home slot instead of the rows that actually failed (R7).
    const { client } = fakeClient({
      failing: ['trakt'],
      failingCalendars: ['shows', 'movies', 'streaming'],
    });

    const inputs = await fetchUpNextInputs(client, ['trakt']);

    expect(inputs.trakt).toEqual([]);
    expect(inputs.traktCalendar).toEqual([]);
    expect(inputs.releases).toEqual([]);
    expect(inputs.errors.map((error) => error.message)).toEqual([
      'watched shows down',
      'shows calendar down',
      'movies calendar down',
      'streaming calendar down',
    ]);
  });
});

// Letterboxd's own settle (U8/R7) is asserted in `letterboxd.test.ts` instead:
// reaching its resolve needs a TMDB token, and `tmdbToken()` memoizes the first
// client read for the whole process — so the suite that fakes a `window` in has
// to be the one that already owns that state, or it silently hands a token to
// every later file that expects none.

describe('upNextQueryKeys', () => {
  test('every key is rooted at "up-next"', () => {
    expect(upNextQueryKeys.all[0]).toBe('up-next');
    expect(upNextQueryKeys.inputs()[0]).toBe('up-next');
  });
});
