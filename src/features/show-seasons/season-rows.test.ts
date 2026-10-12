import { describe, expect, test } from 'bun:test';

import type { NormalizedSeason } from '@/types/media';
import { airedAnimeEpisodes } from '@/features/up-next/catch-up/queue';

import { seasonRows } from './season-rows';

const seasons: NormalizedSeason[] = [1, 2].map((number) => ({
  number,
  title: `Season ${number}`,
  episodes: Array.from({ length: number === 1 ? 39 : 35 }, (_, index) => ({
    number: index + 1,
    title: `Episode ${index + 1}`,
    firstAired: '1989-04-26',
  })),
}));

describe('seasonRows', () => {
  test('closed seasons omit their episodes and logging actions', () => {
    const rows = seasonRows(seasons, new Set());
    expect(rows.map((row) => [row.kind, row.season.number])).toEqual([
      ['season', 1], ['season', 2],
    ]);
  });

  test('Dragon Ball-sized seasons expand into ordered individual rows with distinct keys', () => {
    const rows = seasonRows(seasons, new Set([1, 2]));
    const episodes = rows.filter((row) => row.kind === 'episode');
    expect(episodes.map((row) => [row.season.number, row.episode.number])).toEqual([
      ...Array.from({ length: 39 }, (_, index) => [1, index + 1]),
      ...Array.from({ length: 35 }, (_, index) => [2, index + 1]),
    ]);
    expect(episodes.filter((row) => row.last).map((row) => row.episode.number)).toEqual([39, 35]);
    expect(rows.filter((row) => row.kind === 'mark').map((row) => row.season.number)).toEqual([1, 2]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
    expect(seasonRows(seasons, new Set([2])).some((row) => row.kind === 'episode' && row.season.number === 1)).toBe(false);
  });

  test('an unaired or empty season has no season-wide logging action', () => {
    const rows = seasonRows([
      { number: 1, title: 'Announced', episodes: [{ number: 1, title: 'Unaired', firstAired: '2100-01-01' }] },
      { number: 2, title: 'Empty', episodes: [] },
    ], new Set([1, 2]));
    expect(rows.map((row) => row.kind)).toEqual(['season', 'episode', 'season']);
  });

  test('released anime with no schedule keeps its season logging action without inventing dates', () => {
    const season: NormalizedSeason = {
      number: 1,
      title: 'Episodes',
      episodes: [{ number: 1, title: 'I Picked Up a Prince' }],
    };
    const aired = airedAnimeEpisodes({
      id: 'anilist-5630', title: 'Eden of the East', type: 'ANIME', year: 2009,
      coverImage: '', currentProgress: 0, progressUnit: 'episode',
      lastUpdated: '', externalIds: { anilist: 5630 },
    }, season.episodes, null);
    const rows = seasonRows([season], new Set([1]), (episode) => aired.includes(episode));
    expect(rows.map((row) => row.kind)).toEqual(['season', 'mark', 'episode']);
    expect(season.episodes[0].firstAired).toBeUndefined();
  });
});
