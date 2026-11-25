import { describe, expect, test } from 'bun:test';

import type { UpNextEntry } from '@/features/up-next/types';
import type { NormalizedMediaItem } from '@/types/media';

import { loggedWatch, withLoggedEpisodes, withLoggedKeys } from './optimistic';

function show(id: string, externalIds: NormalizedMediaItem['externalIds']): NormalizedMediaItem {
  return {
    id, title: id, coverImage: '', type: 'TV', currentProgress: 0,
    progressUnit: 'episode', lastUpdated: '', externalIds,
  };
}

const traktShow = show('trakt-1', { trakt: 1 });
const anime = show('anilist-9', { anilist: 9 });

const seasoned: UpNextEntry = {
  kind: 'episode', id: 'trakt-1-s1e12', item: traktShow, status: 'aired', source: 'trakt',
  episode: { season: 1, number: 12, firstAired: '2026-11-01T00:00:00Z' }, episodesBehind: 3,
};
const unseasoned: UpNextEntry = {
  kind: 'episode', id: 'anilist-9-e4', item: anime, status: 'aired', source: 'anilist',
  episode: { number: 4 }, episodesBehind: 2,
};

describe('withLoggedEpisodes', () => {
  test('a log of another show or episode changes nothing, and keeps the list identity', () => {
    const entries = [seasoned, unseasoned];
    const logged = [loggedWatch({ item: traktShow, episodes: [{ season: 1, number: 11 }] })!];

    expect(withLoggedEpisodes(entries, logged)).toBe(entries);
  });

  test('a seasoned card leaves the rail: the next number may belong to another season', () => {
    const logged = [loggedWatch({ item: traktShow, episodes: [{ season: 1, number: 12 }] })!];

    expect(withLoggedEpisodes([seasoned], logged)).toEqual([]);
  });

  test('a seasoned card moves to the episode the catch-up chain proved', () => {
    const logged = [
      loggedWatch({ item: traktShow, episodes: [{ season: 1, number: 12 }] }, { season: 2, number: 1 })!,
    ];

    expect(withLoggedEpisodes([seasoned], logged)).toMatchObject([
      { episode: { season: 2, number: 1 }, episodesBehind: 2 },
    ]);
  });

  test('an unseasoned card counts forward while its backlog lasts, then leaves', () => {
    const one = [loggedWatch({ item: anime, entryEpisodes: [4] })!];
    const both = [...one, loggedWatch({ item: anime, entryEpisodes: [5] })!];

    expect(withLoggedEpisodes([unseasoned], one)).toMatchObject([{ episode: { number: 5 }, episodesBehind: 1 }]);
    expect(withLoggedEpisodes([unseasoned], both)).toEqual([]);
  });

  test('a log made from another tracker’s copy of the show moves the card too', () => {
    const copy = show('simkl-7', { simkl: 7, trakt: 1 });
    const logged = [loggedWatch({ item: copy, episodes: [{ season: 1, number: 12 }] })!];

    expect(withLoggedEpisodes([seasoned], logged)).toEqual([]);
  });
});

describe('withLoggedKeys', () => {
  test('adds the logged episodes of this show only, and keeps the set when nothing is new', () => {
    const watched = new Set(['1-1']);
    const logged = [
      loggedWatch({ item: traktShow, episodes: [{ season: 1, number: 2 }] })!,
      loggedWatch({ item: anime, entryEpisodes: [3] })!,
    ];

    expect([...withLoggedKeys(watched, traktShow, logged)]).toEqual(['1-1', '1-2']);
    expect(withLoggedKeys(new Set(['1-2']), traktShow, logged.slice(0, 1)).size).toBe(1);
    expect(withLoggedKeys(watched, show('trakt-2', { trakt: 2 }), logged)).toBe(watched);
  });
});
