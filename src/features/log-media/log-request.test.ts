import { expect, test } from 'bun:test';
import type { NormalizedMediaItem } from '@/types/media';
import { isEpisodeLog, type LogRequest } from './log-request';

test('only single-episode requests enter catch-up, never movies or season batches', () => {
  const item: NormalizedMediaItem = {
    id: 'show', title: 'Show', coverImage: '', type: 'TV', currentProgress: 0,
    progressUnit: 'episode', lastUpdated: '', externalIds: {},
  };
  const request: LogRequest = {
    item, title: 'Log S1E1', description: 'Show', episodes: [{ season: 1, number: 1 }],
  };
  expect(isEpisodeLog(request)).toBe(true);
  expect(isEpisodeLog({ ...request, episodes: undefined, entryEpisodes: [1] })).toBe(true);
  expect(isEpisodeLog({ ...request, batch: true })).toBe(false);
  expect(isEpisodeLog({ ...request, episodes: [{ season: 1, number: 1 }, { season: 1, number: 2 }] })).toBe(false);
  expect(isEpisodeLog({ ...request, episodes: undefined })).toBe(false);
  expect(isEpisodeLog({ ...request, item: { ...item, type: 'MOVIE' } })).toBe(false);
  expect(isEpisodeLog({ ...request, item: { ...item, type: 'ANIME', isFilm: true } })).toBe(false);
});
