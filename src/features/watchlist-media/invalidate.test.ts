import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, mock, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

// The usual query-layer edge stubs: MMKV, the native fetch client and the
// Serializd transport don't load under bun. The invalidation logic under test
// is untouched by them.
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
mock.module('react-native', () => ({
  Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios },
}));
mock.module('@/lib/http/client', () => ({
  httpFetch: async () => new Response('{}'),
}));
mock.module('@/lib/providers/serializd/transport', () => ({
  serializdFetch: async () => new Response('{}'),
  serializdBaseUrl: 'https://api.test',
}));
const { invalidateAfterWatchlist, shouldRefreshNotifications } = await import(
  './invalidate'
);
// Real sessions against the faked MMKV store, rather than module mocks: both
// session modules export more than the username getter, and replacing them
// wholesale breaks every other importer in the process.
const { connectLetterboxd } = await import('@/state/session/letterboxd');
const { connectSerializd } = await import('@/state/session/serializd');
connectLetterboxd('gian');
connectSerializd({ accessToken: 'token', username: 'gian' });

const SHOW: NormalizedMediaItem = {
  id: 'trakt-1',
  title: 'Show',
  coverImage: '',
  type: 'TV',
  currentProgress: 0,
  progressUnit: 'episode',
  lastUpdated: '2026-07-27T00:00:00.000Z',
  externalIds: { trakt: 1, anilist: 9, tmdb: 77 },
};

/** Records the keys a run invalidated, joined so they read as paths. */
function recordingClient(): { client: QueryClient; keys: string[] } {
  const keys: string[] = [];
  const client = {
    invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      keys.push(queryKey.join('/'));
    },
  } as unknown as QueryClient;
  return { client, keys };
}

/** A bare `YYYY-MM-DD` `days` from now, the shape a release calendar carries. */
function localDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

describe('invalidateAfterWatchlist (plan 0031 KTD-5/R19)', () => {
  test('Trakt invalidates the calendar *prefix*, never a per-window key', () => {
    const { client, keys } = recordingClient();
    invalidateAfterWatchlist(client, SHOW, ['trakt']);
    expect(keys).toContain('trakt/my-calendar');
    // A write path cannot know `startDate`/`days` — naming one would silently
    // refresh nothing.
    expect(keys.some((key) => key.startsWith('trakt/my-calendar/'))).toBe(false);
  });

  test('AniList invalidates the entries read *and* the key derived from it', () => {
    const { client, keys } = recordingClient();
    invalidateAfterWatchlist(client, SHOW, ['anilist']);
    expect(keys).toContain('anilist/current-anime-entries');
    expect(keys).toContain('anilist/current-anime');
    // KTD-2's guard reads this before the next write.
    expect(keys).toContain('anilist/entry-state/9');
  });

  test('Letterboxd invalidates both separately-keyed reads of one list', () => {
    const { client, keys } = recordingClient();
    invalidateAfterWatchlist(client, SHOW, ['letterboxd']);
    expect(keys).toContain('letterboxd/watchlist/gian');
    expect(keys).toContain('letterboxd/watchlist-pages/gian');
  });

  test('Serializd refreshes the progress key its watched guard reads', () => {
    const { client, keys } = recordingClient();
    invalidateAfterWatchlist(client, SHOW, ['serializd']);
    expect(keys).toContain('serializd/progress/gian/77');
  });

  test('the gatherer is invalidated after the provider keys, not before', () => {
    const { client, keys } = recordingClient();
    invalidateAfterWatchlist(client, SHOW, ['trakt', 'anilist']);
    // Invalidating `inputs()` alone would re-serve the provider payloads from
    // cache for up to 15 minutes; ordering is the contract, so assert it.
    expect(keys.indexOf('up-next/inputs')).toBe(keys.length - 1);
    expect(keys.indexOf('trakt/my-calendar')).toBeLessThan(keys.indexOf('up-next/inputs'));
  });

  test('a write that reached no provider invalidates nothing at all', () => {
    const { client, keys } = recordingClient();
    invalidateAfterWatchlist(client, SHOW, []);
    expect(keys).toEqual([]);
  });
});

describe('shouldRefreshNotifications (plan 0031 R19/R20)', () => {
  test('a released 1997 film has no instant to place, so it pays nothing', () => {
    const film: NormalizedMediaItem = {
      ...SHOW,
      type: 'MOVIE',
      title: 'Perfect Blue',
      year: 1997,
      releaseDate: '1997-08-05',
      releaseCalendar: { theatrical: '1997-08-05', physical: '1998-09-01' },
    };
    // The same judgement Calendar makes: nothing in today…today+6, so the item
    // cannot produce a notification candidate and a full regather is pure cost.
    expect(shouldRefreshNotifications(film, 'ios')).toBe(false);
  });

  test('a film whose digital release lands in three days does', () => {
    const film: NormalizedMediaItem = {
      ...SHOW,
      type: 'MOVIE',
      title: 'Out theatrically, streaming Tuesday',
      releaseDate: '2026-05-01',
      releaseCalendar: { theatrical: '2026-05-01', digital: localDate(3) },
    };
    expect(shouldRefreshNotifications(film, 'ios')).toBe(true);
  });

  test('a release just past the seven-day window does not', () => {
    const film: NormalizedMediaItem = {
      ...SHOW,
      type: 'MOVIE',
      releaseCalendar: { digital: localDate(9) },
    };
    expect(shouldRefreshNotifications(film, 'ios')).toBe(false);
  });

  test('never on web — local notifications do not exist there', () => {
    const film: NormalizedMediaItem = {
      ...SHOW,
      type: 'MOVIE',
      releaseCalendar: { digital: localDate(3) },
    };
    expect(shouldRefreshNotifications(film, 'web')).toBe(false);
  });

  test('an item stating no date at all never triggers a regather', () => {
    expect(shouldRefreshNotifications(SHOW, 'ios')).toBe(false);
  });
});
