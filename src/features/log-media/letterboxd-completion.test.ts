import { expect, test } from 'bun:test';
import type { NormalizedMediaItem, NormalizedSeason } from '@/types/media';
import { letterboxdCompletionRequest } from './letterboxd-completion';

const show: NormalizedMediaItem = {
  id: 'tmdb-tv-228880', title: 'Beast Boy: Lone Wolf', type: 'TV', coverImage: '',
  currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: { tmdb: 228880 },
};
const film: NormalizedMediaItem = {
  ...show, id: 'letterboxd-beast-boy-lone-wolf', type: 'MOVIE', tmdbTvVariant: 228880,
  externalIds: { letterboxd: 'beast-boy-lone-wolf' },
};
const catalogue = { ...show, seriesEnded: true, totalEpisodes: 2 };
const seasons: NormalizedSeason[] = [
  { number: 1, title: 'Season 1', episodes: [
    { number: 1, title: 'First', firstAired: '2024-10-28' },
    { number: 2, title: 'Last', firstAired: '2024-10-28' },
  ] },
  { number: 0, title: 'Specials', episodes: [{ number: 1, title: 'Bonus' }] },
];
const watched = new Set(['1-1', '1-2']);

test('completion offers the linked whole-entry confirmation', () => {
  const request = letterboxdCompletionRequest(show, film, catalogue, seasons, watched);
  expect(request?.item.id).toBe('letterboxd-beast-boy-lone-wolf');
});

test('only a clean canonical finale can bridge the pre-write snapshot; a rewatch cannot repeat it', () => {
  const before = new Set(['1-1']);
  expect(letterboxdCompletionRequest(show, film, catalogue, seasons, before)).toBeNull();
  expect(letterboxdCompletionRequest(show, film, catalogue, seasons, before, [{ season: 1, number: 2 }])).not.toBeNull();
  expect(letterboxdCompletionRequest(show, film, catalogue, seasons, before, [{ number: 2 }])).toBeNull();
  expect(letterboxdCompletionRequest(show, film, catalogue, seasons, watched, [{ season: 1, number: 1 }])).toBeNull();
});

test.each([
  ['returning series', film, { ...catalogue, seriesEnded: false }, seasons, watched],
  ['unknown status', film, { ...catalogue, seriesEnded: undefined }, seasons, watched],
  ['unconfirmed relationship', { ...film, tmdbTvVariant: undefined }, catalogue, seasons, watched],
  ['other series', { ...film, tmdbTvVariant: 8 }, catalogue, seasons, watched],
  ['episode gap', film, catalogue, seasons, new Set(['1-2'])],
  ['incomplete catalogue', film, { ...catalogue, totalEpisodes: 3 }, seasons, watched],
  ['unknown total', film, { ...catalogue, totalEpisodes: undefined }, seasons, watched],
  ['missing seasons', film, catalogue, undefined, watched],
  ['unaired finale', film, catalogue, [{ ...seasons[0], episodes: [{ number: 1, title: 'First', firstAired: '2024-10-28' }, { number: 2, title: 'Last', firstAired: '2099-01-01' }] }], watched],
] as const)('%s cannot trigger a whole-series log', (_reason, entry, metadata, layout, keys) => {
  expect(letterboxdCompletionRequest(show, entry, metadata, layout?.map((season) => ({ ...season, episodes: [...season.episodes] })), keys)).toBeNull();
});
