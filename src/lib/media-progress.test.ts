import { expect, test } from 'bun:test';

import { findAniListProgress, mergeMediaProgress, sameProgressItem, type MediaProgress } from './media-progress';
import type { NormalizedMediaItem } from '@/types/media';

const film: NormalizedMediaItem = { id: 'letterboxd-vampire-hunter-d', title: 'Vampire Hunter D', year: 1985, coverImage: '', type: 'MOVIE', currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: { letterboxd: 'vampire-hunter-d' } };
const anime = { ...film, id: 'anilist-732', title: 'VAMPIRE HUNTER D', type: 'ANIME' as const, isFilm: true, externalIds: { anilist: 732 }, totalEpisodes: 1 };

test('completed AniList films match Letterboxd titles without a shared tracker ID', () => {
  const match = findAniListProgress(film, [{ item: anime, status: 'COMPLETED' }]);
  expect(match?.item.externalIds.anilist).toBe(732);
  expect(mergeMediaProgress(film, [{ watched: true, completed: match?.status === 'COMPLETED', current: 0, total: 1, unit: 'episode' }]).completed).toBe(true);
});

test('film matching accepts an exact alias but rejects ambiguous titles, wrong years and series', () => {
  const aliased = { ...anime, title: 'Different primary title', titles: { english: 'Vampire Hunter D' } };
  expect(findAniListProgress(film, [{ item: aliased, status: 'COMPLETED' }])?.item.id).toBe(anime.id);
  for (const candidates of [
    [anime, { ...anime, id: 'anilist-2' }],
    [{ ...anime, year: 2000 }],
    [{ ...anime, isFilm: false }],
  ]) expect(findAniListProgress(film, candidates.map((item) => ({ item, status: 'COMPLETED' })))).toBeUndefined();
});

test('movie/TV ID collisions and sibling anime cours never share progress', () => {
  const tv = { ...film, type: 'TV' as const, externalIds: { tmdb: 9463 } };
  expect(sameProgressItem({ ...film, externalIds: { tmdb: 9463 } }, tv)).toBe(false);
  expect(sameProgressItem({ ...anime, isFilm: false, externalIds: { anilist: 1, tmdb: 42 } }, { ...anime, isFilm: false, externalIds: { anilist: 2, tmdb: 42 } })).toBe(false);
});

test('provider progress takes the furthest count, not the sum, and a begun series is incomplete', () => {
  const tv = { ...film, type: 'TV' as const, totalEpisodes: 12 };
  const sources: MediaProgress[] = [3, 5].map((current) => ({ current, total: 12, watched: true, completed: false, unit: 'episode' }));
  expect(mergeMediaProgress(tv, sources)).toMatchObject({ current: 5, watched: true, completed: false, total: 12 });
  expect(mergeMediaProgress(tv, [{ ...sources[0], current: 12 }]).completed).toBe(true);
});

test('Serializd season counts never masquerade as episode progress and unknown totals stay unknown', () => {
  const tv = { ...film, type: 'TV' as const, totalEpisodes: 50 };
  const seasons: MediaProgress = { current: 1, total: 5, watched: true, completed: false, unit: 'season' };
  expect(mergeMediaProgress(tv, [seasons])).toMatchObject({ current: 1, total: 5, unit: 'season', completed: false });
  expect(mergeMediaProgress(tv, [{ ...seasons, total: undefined }])).toMatchObject({ total: undefined, completed: false });
});
