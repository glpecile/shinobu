import { expect, test } from 'bun:test';
import type { NormalizedMediaItem } from '@/types/media';
import { chaptersThrough, isEpisodeLog, stepThroughChapter, throughChapterText, type LogRequest } from './log-request';

test('only single-episode requests enter catch-up, never movies, manga or season batches', () => {
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
  expect(isEpisodeLog({
    ...request, episodes: undefined, entryEpisodes: [7], item: { ...item, type: 'MANGA', progressUnit: 'chapter' },
  })).toBe(false);
});

test('a chapter range starts at the next chapter and stays within the total', () => {
  expect(chaptersThrough(6, '9')).toEqual([6, 7, 8, 9]);
  expect(chaptersThrough(6, '5')).toBeNull();
  expect(throughChapterText('70', 59)).toBe('59');
  expect(throughChapterText('1,200')).toBe('1200');
  expect(stepThroughChapter('12', 1, 6, 59)).toBe('13');
  expect(stepThroughChapter('59', 1, 6, 59)).toBe('59');
  expect(stepThroughChapter('', -1, 6)).toBe('6');
});
