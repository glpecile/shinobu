import { describe, expect, mock, test } from 'bun:test';

import type { HiddenItem } from '@/state/prefs/hidden-items';
import type { NormalizedMediaItem } from '@/types/media';

import type { UpNextEntry } from './types';

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
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));

const { visibleEntries } = await import('./use-up-next-sections');

function film(slug: string): NormalizedMediaItem {
  return {
    id: `trakt-${slug}`,
    title: slug,
    coverImage: '',
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-27T00:00:00.000Z',
    externalIds: {},
  };
}

function releaseEntry(
  item: NormalizedMediaItem,
  kind: 'theatrical' | 'digital',
  date: string,
): UpNextEntry {
  return {
    kind: 'release',
    id: `${item.id}-${kind}`,
    item,
    release: { kind, date },
    status: 'upcoming',
    source: 'trakt',
  };
}

function episodeEntry(id: string): UpNextEntry {
  return {
    kind: 'episode',
    id: `trakt-${id}-s1e1`,
    item: {
      id: `trakt-${id}`,
      title: id,
      coverImage: '',
      type: 'TV',
      currentProgress: 0,
      progressUnit: 'episode',
      lastUpdated: '2026-07-27T00:00:00.000Z',
      externalIds: {},
    },
    episode: { season: 1, number: 1, firstAired: '2026-07-28T20:00:00.000Z' },
    status: 'upcoming',
    source: 'trakt',
  };
}

const hide = (item: NormalizedMediaItem): HiddenItem => ({
  id: item.id,
  title: item.title,
});

describe('visibleEntries', () => {
  test('a hidden film drops both of its release rows', () => {
    const dune = film('dune');
    const entries = [
      releaseEntry(dune, 'theatrical', '2026-07-29'),
      releaseEntry(dune, 'digital', '2026-08-02'),
      episodeEntry('severance'),
    ];

    const visible = visibleEntries(entries, [hide(dune)]);

    expect(visible.map((entry) => entry.id)).toEqual(['trakt-severance-s1e1']);
  });

  test('hiding a copy a dedupe folded into an entry hides the entry', () => {
    const entries = [{ ...episodeEntry('severance'), twinIds: ['simkl-severance'] }];

    expect(visibleEntries(entries, [{ id: 'simkl-severance', title: 'severance' }])).toEqual([]);
  });
});
