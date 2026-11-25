import { expect, test } from 'bun:test';
import type { AnimeRelations } from '@/lib/providers/anilist/relations';
import type { AniListEntryState } from '@/lib/providers/anilist/reads';
import { sequelLogRequest } from './sequel-log';

const entry = (progress: number, status: 'CURRENT' | 'COMPLETED' = 'CURRENT'): AniListEntryState => ({
  total: 2,
  volumes: null,
  entry: {
    id: 1, status, progress, progressVolumes: 0, repeat: 0,
    score: 0, notes: null, startedAt: null, customLists: [],
  },
});

const sequel: AnimeRelations = {
  item: {
    id: 'anilist-176301', title: 'The Apothecary Diaries Season 2', type: 'ANIME', coverImage: '',
    currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: { anilist: 176301 },
  },
  entryState: { total: 2, volumes: null, entry: null },
  season: { number: 1, title: 'Episodes', episodes: [
    { number: 1, title: 'First', firstAired: '2025-01-10T15:00:00Z' },
    { number: 2, title: 'Second', firstAired: '2099-01-01T15:00:00Z' },
  ] },
  relations: [], recommendations: [], tags: [], characters: [], staff: [],
};

test('a finished entry continues at its sequel’s next aired episode', () => {
  expect(sequelLogRequest(sequel)).toMatchObject({ item: sequel.item, entryEpisodes: [1] });
});

test('a sequel whose next episode has not aired has nothing to log', () => {
  expect(sequelLogRequest({ ...sequel, entryState: entry(1) })).toBeNull();
});

test('a completed sequel stays complete even when its progress is zero', () => {
  expect(sequelLogRequest({ ...sequel, entryState: entry(0, 'COMPLETED') })).toBeNull();
});

test('a public read cannot name the next episode', () => {
  expect(sequelLogRequest({ ...sequel, entryState: null })).toBeNull();
});
