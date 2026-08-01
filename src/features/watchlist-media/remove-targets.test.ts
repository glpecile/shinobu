import { describe, expect, mock, test } from 'bun:test';

import type { WatchlistEntry } from '@/features/watchlist/types';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * R35's routing rules, as pure functions (plan 0031 U16). The distinction this
 * suite exists to hold: **absence from `sources` is not proof of absence.**
 * `sources` records "providers whose read leg returned this item", so three
 * connected-and-applicable cases can never appear in it — Serializd (no leg in
 * v1), AniList for MANGA, and any leg that errored on this gather — and each of
 * them is `unknown`, not known-absent.
 */
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
// `./remove-targets` imports `@/state/queries/watchlist`, which imports
// `./simkl` (plan 0034 U7), whose auth re-export reaches expo-crypto —
// mirror the surface it consumes instead of loading the whole expo package
// under bun (the `state/queries/simkl.test.ts` pattern).
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));

const {
  hasWatchlistReadLeg,
  shouldOfferWatchlistAdd,
  splitWatchlistRemoveTargets,
} = await import('./remove-targets');

const CONNECTED: ProviderId[] = ['trakt', 'anilist', 'letterboxd', 'serializd'];

function film(overrides: Partial<NormalizedMediaItem> = {}): NormalizedMediaItem {
  return {
    id: 'trakt-1',
    title: 'A Film',
    coverImage: '',
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-27T00:00:00.000Z',
    year: 1997,
    externalIds: { trakt: 1, tmdb: 77, letterboxd: 'a-film' },
    ...overrides,
  };
}

/** A TV series — the shape that reaches Serializd, the provider with no read leg. */
function series(overrides: Partial<NormalizedMediaItem> = {}): NormalizedMediaItem {
  return film({
    id: 'trakt-9',
    title: 'A Show',
    type: 'TV',
    externalIds: { trakt: 9, tmdb: 99 },
    ...overrides,
  });
}

function entryFor(
  item: NormalizedMediaItem,
  sources: ProviderId[],
): WatchlistEntry {
  return { id: item.id, item, sources, sourceIds: [item.id] };
}

describe('hasWatchlistReadLeg — who can prove absence (R35)', () => {
  test('Serializd never can: it has no watchlist read leg in v1 (R32)', () => {
    expect(hasWatchlistReadLeg('serializd', series(), CONNECTED, [])).toBe(false);
  });

  test('AniList can for anime and cannot for manga — the leg is `type: ANIME`', () => {
    expect(hasWatchlistReadLeg('anilist', film({ type: 'ANIME' }), CONNECTED, [])).toBe(
      true,
    );
    expect(hasWatchlistReadLeg('anilist', film({ type: 'MANGA' }), CONNECTED, [])).toBe(
      false,
    );
  });

  test('a leg that errored on this gather makes its provider unknown, not absent', () => {
    expect(hasWatchlistReadLeg('trakt', film(), CONNECTED, [])).toBe(true);
    expect(
      hasWatchlistReadLeg('trakt', film(), CONNECTED, [
        { provider: 'trakt', message: '502' },
      ]),
    ).toBe(false);
  });

  test('a provider that is not connected has no leg either', () => {
    expect(hasWatchlistReadLeg('letterboxd', film(), ['trakt'], [])).toBe(false);
  });

  test('a leg that read only part of the list has not proven absence', () => {
    // Letterboxd's scrape is paginated behind `onEndReached` and never
    // auto-paged, so a film on page 3 of a 600-film watchlist is missing from
    // `sources` for a reason that has nothing to do with membership.
    expect(hasWatchlistReadLeg('letterboxd', film(), CONNECTED, [], [])).toBe(true);
    expect(
      hasWatchlistReadLeg('letterboxd', film(), CONNECTED, [], ['letterboxd']),
    ).toBe(false);
  });
});

describe('splitWatchlistRemoveTargets — writes follow `sources` (R35)', () => {
  test('a Trakt-only series writes to Trakt alone, with Serializd unknown', () => {
    const split = splitWatchlistRemoveTargets(
      series(),
      ['trakt'],
      CONNECTED,
      'ios',
      [],
    );
    // AniList and Letterboxd are not applicable to a TV item at all, so they are
    // absent from every bucket — routing, not R35, excluded them.
    expect(split.targets).toEqual(['trakt']);
    expect(split.manual).toEqual([]);
    expect(split.unknown).toEqual(['serializd']);
  });

  test('a provider with a healthy leg that did not return the item is skipped silently', () => {
    // Letterboxd is connected, applicable to a film and read successfully; it
    // simply does not hold this one. That is the *only* known-absent case.
    const split = splitWatchlistRemoveTargets(film(), ['trakt'], CONNECTED, 'ios', []);
    expect(split.targets).toEqual(['trakt']);
    expect(split.manual).toEqual([]);
    expect(split.unknown).toEqual([]);
  });

  test('a partially-read Letterboxd leg is an unknown row, not a silent drop', () => {
    // The failure mode this guards: without `incomplete`, the film below is
    // reported as known-absent from Letterboxd, the removal quietly skips it,
    // and the settled "Removed" label asserts a completeness nobody checked.
    const split = splitWatchlistRemoveTargets(
      film(),
      ['trakt'],
      CONNECTED,
      'ios',
      [],
      ['letterboxd'],
    );
    expect(split.targets).toEqual(['trakt']);
    expect(split.unknown).toEqual(['letterboxd']);
  });

  test('a Trakt leg failure renders as an unknown row rather than a claim of absence', () => {
    const split = splitWatchlistRemoveTargets(film(), ['letterboxd'], CONNECTED, 'ios', [
      { provider: 'trakt', message: '502' },
    ]);
    // Letterboxd holds it and (plan 0033) removes via the fan-out on native.
    expect(split.targets).toEqual(['letterboxd']);
    expect(split.manual).toEqual([]);
    expect(split.unknown).toEqual(['trakt']);
  });

  test('Letterboxd removes via the fan-out on native, manual only on web (plan 0033 R7)', () => {
    for (const platform of ['ios', 'android']) {
      const split = splitWatchlistRemoveTargets(
        film(),
        ['trakt', 'letterboxd'],
        CONNECTED,
        platform,
        [],
      );
      expect(split.targets).toEqual(['trakt', 'letterboxd']);
      expect(split.manual).toEqual([]);
    }
    const web = splitWatchlistRemoveTargets(
      film(),
      ['trakt', 'letterboxd'],
      CONNECTED,
      'web',
      [],
    );
    expect(web.targets).toEqual(['trakt']);
    expect(web.manual).toEqual(['letterboxd']);
  });

  test('a manga entry leaves AniList unknown — OQ-4a defers that read', () => {
    const manga = film({ id: 'anilist-5', type: 'MANGA', externalIds: { anilist: 5 } });
    const split = splitWatchlistRemoveTargets(manga, [], CONNECTED, 'ios', []);
    expect(split.targets).toEqual([]);
    expect(split.unknown).toEqual(['anilist']);
  });
});

describe('shouldOfferWatchlistAdd — R12 as amended for /watchlist', () => {
  test('an item already on every applicable provider offers no add row', () => {
    const entry = entryFor(film(), ['trakt', 'letterboxd']);
    expect(shouldOfferWatchlistAdd(entry, ['trakt', 'letterboxd'], 'ios')).toBe(false);
  });

  test('a film on Letterboxd but not on Trakt still offers one', () => {
    const entry = entryFor(film(), ['letterboxd']);
    expect(shouldOfferWatchlistAdd(entry, ['trakt', 'letterboxd'], 'ios')).toBe(true);
  });

  test('a manual-only remaining target counts — the deep link is the affordance', () => {
    // Letterboxd's *add* is manual too, so the row it produces is a link rather
    // than a write. Offering it beats hiding the one tracker still missing it.
    const entry = entryFor(film(), ['trakt']);
    expect(shouldOfferWatchlistAdd(entry, ['trakt', 'letterboxd'], 'ios')).toBe(true);
  });

  test('a provider with unknown membership is not "missing the item" (R35)', () => {
    // Regression from the first live run of the sheet: a Trakt-sourced series
    // rendered a disabled "On your watchlist", an "Add on Serializd" row, a
    // "Remove from watchlist" button and a "Remove on Serializd" row — the same
    // provider pointed both ways. "Add on Serializd" asserts Serializd does not
    // have the show, and Serializd has no read leg to have established that.
    const entry = entryFor(series(), ['trakt']);
    expect(shouldOfferWatchlistAdd(entry, CONNECTED, 'ios')).toBe(false);
  });

  test('an errored or partially-read leg suppresses the add row the same way', () => {
    const entry = entryFor(film(), ['trakt']);
    // Healthy Letterboxd leg that did not return the film: genuinely missing.
    expect(shouldOfferWatchlistAdd(entry, ['trakt', 'letterboxd'], 'ios')).toBe(true);
    // Same entry, leg down — now it is unknown, not missing.
    expect(
      shouldOfferWatchlistAdd(entry, ['trakt', 'letterboxd'], 'ios', [
        { provider: 'letterboxd', message: '502' },
      ]),
    ).toBe(false);
    // Same entry, leg read only page 1.
    expect(
      shouldOfferWatchlistAdd(entry, ['trakt', 'letterboxd'], 'ios', [], ['letterboxd']),
    ).toBe(false);
  });
});
