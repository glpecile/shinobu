import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, mock, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

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
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));
const { invalidateAfterWatchlist, shouldRefreshNotifications } = await import(
  './invalidate'
);
// Real sessions against faked MMKV: bun's mock.module is process-global and would break other test files importing these modules.
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

function recordingClient(): { client: QueryClient; keys: string[] } {
  const keys: string[] = [];
  const client = {
    invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      keys.push(queryKey.join('/'));
    },
  } as unknown as QueryClient;
  return { client, keys };
}

function localDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

describe('invalidateAfterWatchlist (plan 0031 KTD-5/R19)', () => {
  test('Trakt invalidates the calendar and watchlist *prefixes*, never a per-window key', () => {
    const { client, keys } = recordingClient();
    invalidateAfterWatchlist(client, SHOW, ['trakt']);
    expect(keys).toContain('trakt/my-calendar');
    expect(keys.some((key) => key.startsWith('trakt/my-calendar/'))).toBe(false);
    expect(keys).toContain('trakt/watchlist');
    expect(keys.some((key) => key.startsWith('trakt/watchlist/'))).toBe(false);
  });

  test('AniList invalidates the entries read and the entry-state guard', () => {
    const { client, keys } = recordingClient();
    invalidateAfterWatchlist(client, SHOW, ['anilist']);
    expect(keys).toContain('anilist/current-anime-entries');
    expect(keys.some((key) => key.startsWith('anilist/entry-state/9/'))).toBe(true);
    expect(keys).toContain('anilist/relations/9');
  });

  test('an AniList manga write refreshes the manga read instead', () => {
    const { client, keys } = recordingClient();
    invalidateAfterWatchlist(client, { ...SHOW, type: 'MANGA' }, ['anilist']);
    expect(keys).toContain('anilist/current-manga-entries');
    expect(keys).not.toContain('anilist/current-anime-entries');
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

  test('Simkl invalidates the all-items prefix and the activities delta (plan 0034 U6)', () => {
    const { client, keys } = recordingClient();
    invalidateAfterWatchlist(client, SHOW, ['simkl']);
    expect(keys).toContain('simkl/all-items');
    expect(keys).toContain('simkl/activities');
  });

  test('the gatherers are invalidated after the provider keys, not before', () => {
    const { client, keys } = recordingClient();
    invalidateAfterWatchlist(client, SHOW, ['trakt', 'anilist']);
    expect(keys.indexOf('watchlist/inputs')).toBe(keys.length - 1);
    expect(keys.indexOf('up-next/inputs')).toBe(keys.length - 2);
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
