import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, mock, test } from 'bun:test';

import type { AniListCurrentEntry } from '@/lib/providers/anilist/normalize';
import type {
  SimklCalendarEntry,
  SimklLibrary,
  SimklLibraryEntry,
} from '@/lib/providers/simkl/normalize';
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

/** The Simkl legs' cacheable reads, as the fake client keys them. */
type SimklLibraryStatus = 'watching' | 'plantowatch';
type SimklCalendarFileKind = 'tv' | 'anime' | 'movie_release';

/** One Simkl library entry with only the fields the Up Next legs consume. */
function simklEntry(
  simklId: number,
  overrides: Omit<Partial<SimklLibraryEntry>, 'item'> & {
    item?: Partial<NormalizedMediaItem>;
  } = {},
): SimklLibraryEntry {
  const { item: itemOverrides, ...entryOverrides } = overrides;
  return {
    item: {
      id: `simkl-${simklId}`,
      title: `Simkl ${simklId}`,
      coverImage: '',
      type: 'TV',
      currentProgress: 4,
      progressUnit: 'episode',
      lastUpdated: '2026-07-21T00:00:00.000Z',
      externalIds: { simkl: simklId },
      ...itemOverrides,
    },
    status: 'watching',
    watchedKeys: new Set<string>(),
    watchedEpisodes: [],
    ...entryOverrides,
  };
}

function simklLibrary(partial: Partial<SimklLibrary> = {}): SimklLibrary {
  return { shows: [], movies: [], anime: [], ...partial };
}

/** One rolling-file airing, in the shape `normalizeCalendarFile` emits. */
function simklCalendarEntry(
  simklId: number,
  overrides: Partial<SimklCalendarEntry> = {},
): SimklCalendarEntry {
  return {
    simklId,
    date: '2026-08-03T20:00:00Z',
    title: `Simkl ${simklId}`,
    poster: '',
    externalIds: { simkl: simklId },
    episode: { season: 1, number: 4 },
    ...overrides,
  };
}

interface Scenario {
  shows?: NormalizedMediaItem[];
  anime?: AniListCurrentEntry[];
  /** `/calendars/my/shows` rows — Calendar's Trakt half (plan 0030 KTD-2). */
  calendarShows?: TraktCalendarEpisode[];
  /** Per-calendar movie rows, keyed by Trakt's segment name. */
  calendarMovies?: Partial<Record<CalendarType, TraktCalendarRelease[]>>;
  /** The two `/sync/all-items` snapshots the Simkl legs read (plan 0034 U8). */
  simklLibraries?: Partial<Record<SimklLibraryStatus, SimklLibrary>>;
  /** The rolling CDN calendar files, keyed by kind (KTD-4). */
  simklCalendars?: Partial<Record<SimklCalendarFileKind, SimklCalendarEntry[]>>;
  /** Providers whose top-level read rejects. */
  failing?: Array<'trakt' | 'anilist'>;
  /** Trakt ids whose per-show progress read rejects. */
  failingProgress?: number[];
  /** Calendars whose read rejects — each settles on its own (R7). */
  failingCalendars?: CalendarType[];
  /** Simkl reads that reject, by snapshot status or calendar kind. */
  failingSimkl?: Array<SimklLibraryStatus | SimklCalendarFileKind>;
}

/**
 * Every provider read reaches the network through `queryClient.fetchQuery`, so
 * a client that answers by query key is the whole seam — no module mocking, and
 * each cached read is observable (that is how the pool cap is asserted).
 */
function fakeClient(scenario: Scenario) {
  const progressRequests: number[] = [];
  const calendarKeys: unknown[][] = [];
  const simklRequests: string[] = [];
  const fetchQuery = async ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const [root, kind, id] = queryKey as [string, string, number];
    if (root === 'simkl' && kind === 'all-items') {
      const status = queryKey[3] as SimklLibraryStatus;
      simklRequests.push(status);
      if (scenario.failingSimkl?.includes(status) === true) {
        throw new Error(`${status} snapshot down`);
      }
      return simklLibrary(scenario.simklLibraries?.[status]);
    }
    if (root === 'simkl' && kind === 'calendar') {
      const fileKind = queryKey[2] as SimklCalendarFileKind;
      simklRequests.push(fileKind);
      if (scenario.failingSimkl?.includes(fileKind) === true) {
        throw new Error(`${fileKind} calendar down`);
      }
      return scenario.simklCalendars?.[fileKind] ?? [];
    }
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
    simklRequests,
  };
}

describe('fetchUpNextInputs', () => {
  test('Trakt-only: AniList being disconnected is absence, not an error', async () => {
    const { client } = fakeClient({ shows: [show(1, '2026-07-20T00:00:00.000Z')] });

    const inputs = await fetchUpNextInputs(client, ['trakt']);

    expect(inputs.progress).toHaveLength(1);
    expect(inputs.progress[0].nextEpisode?.number).toBe(2);
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

    expect(inputs.progress.map((input) => input.item.externalIds.trakt)).toEqual([
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
    expect(inputs.progress).toEqual([]);
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
    expect(inputs.progress).toEqual([]);
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
      progress: [],
      calendar: [],
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
    expect(inputs.progress).toHaveLength(1);
    expect(inputs.calendar).toEqual([{ ...airing, source: 'trakt' }]);
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

    expect(inputs.progress).toHaveLength(1);
    expect(inputs.calendar).toEqual([]);
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

    expect(inputs.calendar).toEqual([{ ...airing, source: 'trakt' }]);
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

    expect(inputs.progress).toEqual([]);
    expect(inputs.calendar).toEqual([]);
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

describe('fetchUpNextInputs — the Simkl legs (plan 0034 U8)', () => {
  test('a Simkl-only user gets progress pointers with their air instants verbatim', async () => {
    const { client } = fakeClient({
      simklLibraries: {
        watching: simklLibrary({
          shows: [
            simklEntry(1, {
              nextToWatch: {
                season: 1,
                episode: 5,
                title: 'Fifth',
                date: '2026-07-30T01:00:00+09:00',
              },
            }),
          ],
        }),
      },
    });

    const inputs = await fetchUpNextInputs(client, ['simkl']);

    expect(inputs.progress).toEqual([
      {
        item: simklEntry(1).item,
        source: 'simkl',
        nextEpisode: {
          season: 1,
          number: 5,
          title: 'Fifth',
          // Byte-for-byte what Simkl stated — never reformatted (has-aired.ts
          // parses offsets itself; a re-spelling here is where timezone bugs
          // are born).
          firstAired: '2026-07-30T01:00:00+09:00',
        },
      },
    ]);
    expect(inputs.errors).toEqual([]);
  });

  test('a null-date pointer is marked aired-by-count only when the counts prove it', async () => {
    const { client } = fakeClient({
      simklLibraries: {
        watching: simklLibrary({
          shows: [
            // 4 watched, 10 total, 2 unaired → 8 aired: behind, proven aired.
            simklEntry(2, {
              item: { totalEpisodes: 10 },
              notAiredEpisodes: 2,
              nextToWatch: { season: 1, episode: 5, date: null },
            }),
            // 8 watched of 8 aired → caught up; the undated pointer is a
            // future episode and must not be offered as a quick-log.
            simklEntry(3, {
              item: { currentProgress: 8, totalEpisodes: 10 },
              notAiredEpisodes: 2,
              nextToWatch: { season: 1, episode: 9, date: null },
            }),
            // No counts at all → unknown is not "aired" (the Trakt rule).
            simklEntry(4, {
              nextToWatch: { season: 1, episode: 5, date: null },
            }),
          ],
        }),
      },
    });

    const inputs = await fetchUpNextInputs(client, ['simkl']);

    const byId = new Map(inputs.progress.map((input) => [input.item.id, input]));
    expect(byId.get('simkl-2')?.nextEpisodeAiredByCount).toBe(true);
    expect(byId.get('simkl-3')?.nextEpisodeAiredByCount).toBeUndefined();
    expect(byId.get('simkl-4')?.nextEpisodeAiredByCount).toBeUndefined();
  });

  test('anime pointers keep absolute numbering — no season fabricated', async () => {
    const { client } = fakeClient({
      simklLibraries: {
        watching: simklLibrary({
          anime: [
            simklEntry(5, {
              item: { type: 'ANIME' },
              nextToWatch: { episode: 13, date: '2026-07-25T15:30:00Z' },
            }),
          ],
        }),
      },
    });

    const inputs = await fetchUpNextInputs(client, ['simkl']);

    expect(inputs.progress[0].nextEpisode).toEqual({
      number: 13,
      firstAired: '2026-07-25T15:30:00Z',
    });
  });

  test('the calendar files are intersected: an untracked airing never appears (KTD-4)', async () => {
    const tracked = simklEntry(10);
    const { client } = fakeClient({
      simklLibraries: {
        watching: simklLibrary({ shows: [tracked] }),
      },
      simklCalendars: {
        tv: [
          simklCalendarEntry(10, { finaleType: 'season' }),
          // Airs this week, tracked by nobody — the CDN file speaks for every
          // show on Simkl, so the intersection is the entire privacy of "my"
          // calendar.
          simklCalendarEntry(9999),
        ],
      },
    });

    const inputs = await fetchUpNextInputs(client, ['simkl']);

    expect(inputs.calendar).toEqual([
      {
        item: tracked.item,
        source: 'simkl',
        episode: { season: 1, number: 4, firstAired: '2026-08-03T20:00:00Z' },
        finale: 'season',
      },
    ]);
  });

  test('a plantowatch show is tracked for the calendar but never the progress pool', async () => {
    const planned = simklEntry(11, { status: 'plantowatch' });
    const { client } = fakeClient({
      simklLibraries: {
        plantowatch: simklLibrary({ shows: [planned] }),
      },
      simklCalendars: { tv: [simklCalendarEntry(11)] },
    });

    const inputs = await fetchUpNextInputs(client, ['simkl']);

    // The watchlisted premiere reaches Calendar (the KTD-4 tracked set is
    // watching + plantowatch)…
    expect(inputs.calendar).toHaveLength(1);
    expect(inputs.calendar[0].item.id).toBe('simkl-11');
    // …but contributes no progress pointer — mirroring Trakt, where the
    // watchlist reaches Up Next only through the calendar leg.
    expect(inputs.progress).toEqual([]);
  });

  test('movie_release rows intersect with tracked movies and land as day-dated releases', async () => {
    const wantedMovie = simklEntry(20, {
      status: 'plantowatch',
      item: { type: 'MOVIE' },
    });
    const { client } = fakeClient({
      simklLibraries: {
        plantowatch: simklLibrary({ movies: [wantedMovie] }),
      },
      simklCalendars: {
        movie_release: [
          simklCalendarEntry(20, {
            date: '2026-08-05T04:00:00Z',
            episode: undefined,
          }),
          simklCalendarEntry(8888, { episode: undefined }), // untracked → dropped
        ],
      },
    });

    const inputs = await fetchUpNextInputs(client, ['simkl']);

    expect(inputs.releases).toEqual([
      {
        item: wantedMovie.item,
        kind: 'theatrical',
        // The instant's UTC day: a release is a calendar day (`UpNextRelease`),
        // not an instant.
        date: '2026-08-05',
        source: 'simkl',
      },
    ]);
    // A tracked movie is not an episode source.
    expect(inputs.calendar).toEqual([]);
  });

  test('nothing tracked skips the megabyte calendar downloads entirely', async () => {
    const { client, simklRequests } = fakeClient({});

    const inputs = await fetchUpNextInputs(client, ['simkl']);

    expect(inputs.calendar).toEqual([]);
    expect(inputs.releases).toEqual([]);
    expect(simklRequests).not.toContain('tv');
    expect(simklRequests).not.toContain('anime');
    expect(simklRequests).not.toContain('movie_release');
  });

  test('one calendar file failing degrades only its own leg (R7)', async () => {
    const { client } = fakeClient({
      simklLibraries: {
        watching: simklLibrary({
          shows: [
            simklEntry(30, {
              nextToWatch: {
                season: 1,
                episode: 2,
                date: '2026-07-20T20:00:00Z',
              },
            }),
          ],
        }),
      },
      failingSimkl: ['tv'],
    });

    const inputs = await fetchUpNextInputs(client, ['simkl']);

    // Continue Watching's pointers survive the calendar outage…
    expect(inputs.progress).toHaveLength(1);
    // …and the failure is named, not swallowed.
    expect(inputs.errors).toEqual([
      { provider: 'simkl', message: 'tv calendar down' },
    ]);
  });

  test('Trakt and Simkl contribute to the same provider-tagged legs side by side', async () => {
    const { client } = fakeClient({
      shows: [show(1, '2026-07-20T00:00:00.000Z')],
      simklLibraries: {
        watching: simklLibrary({
          shows: [
            simklEntry(40, {
              nextToWatch: {
                season: 2,
                episode: 6,
                date: '2026-07-21T20:00:00Z',
              },
            }),
          ],
        }),
      },
    });

    const inputs = await fetchUpNextInputs(client, ['trakt', 'simkl']);

    expect(inputs.progress.map((input) => input.source)).toEqual([
      'trakt',
      'simkl',
    ]);
    expect(inputs.errors).toEqual([]);
  });

  test('with neither tracker connected, the AniList and Letterboxd legs still run', async () => {
    const { client, simklRequests, progressRequests } = fakeClient({
      anime: [animeEntry(1)],
    });

    const inputs = await fetchUpNextInputs(client, ['anilist', 'letterboxd']);

    expect(inputs.anilist).toHaveLength(1);
    expect(inputs.progress).toEqual([]);
    expect(inputs.calendar).toEqual([]);
    expect(inputs.errors).toEqual([]);
    expect(simklRequests).toEqual([]);
    expect(progressRequests).toEqual([]);
  });
});

describe('upNextQueryKeys', () => {
  test('every key is rooted at "up-next"', () => {
    expect(upNextQueryKeys.all[0]).toBe('up-next');
    expect(upNextQueryKeys.inputs()[0]).toBe('up-next');
  });
});
