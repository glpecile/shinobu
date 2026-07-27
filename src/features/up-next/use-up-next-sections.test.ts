import { describe, expect, mock, test } from 'bun:test';

import type { HiddenItem } from '@/state/prefs/hidden-items';
import type { NormalizedMediaItem } from '@/types/media';

import type { UpNextEntry } from './types';

// Import-time stubs only: this module sits next to the Suspense hook, so it
// pulls in the query layer's MMKV, native-fetch and react-native imports, none
// of which load under bun. Nothing the filter *does* is mocked — it takes its
// hidden list as an argument, which is the whole reason it is a pure export.
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

const { visibleEntries } = await import('./use-up-next-sections');

/**
 * The hidden-items half of plan 0030 U8 (R8). The hook itself is one line of
 * store plumbing; the contract worth guarding is what the pure filter does with
 * a *film*, whose two release rows share a single media id — the one shape the
 * entry union introduced that this filter never had to handle before.
 */

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

    // Both rows share the film's media id, and hiding a film means the film —
    // leaving the streaming row standing would be the hide half-applied.
    expect(visible.map((entry) => entry.id)).toEqual(['trakt-severance-s1e1']);
  });

  test('hiding one film leaves another film’s release rows alone', () => {
    const dune = film('dune');
    const odyssey = film('odyssey');
    const entries = [
      releaseEntry(dune, 'theatrical', '2026-07-29'),
      releaseEntry(odyssey, 'theatrical', '2026-07-31'),
      releaseEntry(odyssey, 'digital', '2026-08-05'),
    ];

    const visible = visibleEntries(entries, [hide(dune)]);

    expect(visible.map((entry) => entry.id)).toEqual([
      'trakt-odyssey-theatrical',
      'trakt-odyssey-digital',
    ]);
  });

  test('nothing hidden returns the very same array (identity, not a copy)', () => {
    const entries = [
      releaseEntry(film('dune'), 'theatrical', '2026-07-29'),
      episodeEntry('severance'),
    ];

    // A fresh array every render would change identity for every card below it
    // — the exact regression `visibleItems` was rewritten to avoid (plan 0024
    // U7/KTD4).
    expect(visibleEntries(entries, [])).toBe(entries);
  });

  test('a hidden item that isn’t in the section changes nothing', () => {
    const entries = [episodeEntry('severance')];

    expect(visibleEntries(entries, [hide(film('dune'))])).toBe(entries);
  });
});
