import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';
import { simklDiaryEntries } from './diary';
import type {
  SimklLibrary,
  SimklLibraryEntry,
  SimklWatchedEpisode,
} from './normalize';

function item(
  overrides: Partial<NormalizedMediaItem> & { id: string },
): NormalizedMediaItem {
  return {
    title: 'Untitled',
    coverImage: '',
    type: 'TV',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-20T00:00:00.000Z',
    externalIds: {},
    ...overrides,
  };
}

function libraryEntry(
  overrides: Partial<SimklLibraryEntry> & { item: NormalizedMediaItem },
): SimklLibraryEntry {
  const watchedEpisodes: SimklWatchedEpisode[] = overrides.watchedEpisodes ?? [];
  return {
    status: 'watching',
    watchedKeys: new Set(
      watchedEpisodes.map((episode) => `${episode.season}-${episode.number}`),
    ),
    watchedEpisodes,
    ...overrides,
  };
}

function library(overrides: Partial<SimklLibrary> = {}): SimklLibrary {
  return { shows: [], movies: [], anime: [], ...overrides };
}

describe('simklDiaryEntries — episodes', () => {
  test('a show flattens to one dated entry per watched episode, season included', () => {
    const entries = simklDiaryEntries(
      library({
        shows: [
          libraryEntry({
            item: item({ id: 'simkl-100', title: 'Some Show' }),
            watchedEpisodes: [
              { season: 2, number: 4, watchedAt: '2026-07-30T21:00:00Z' },
              { season: 2, number: 5, watchedAt: '2026-07-31T21:00:00Z' },
            ],
          }),
        ],
      }),
    );
    expect(entries).toHaveLength(2);
    // Newest first.
    expect(entries[0]).toMatchObject({
      id: 'simkl-100-s2e5',
      provider: 'simkl',
      watchedAt: '2026-07-31T21:00:00Z',
      episodes: [5],
      season: 2,
    });
    expect(entries[1].id).toBe('simkl-100-s2e4');
  });

  test('an undated watched episode is skipped, not guessed onto a day', () => {
    const entries = simklDiaryEntries(
      library({
        shows: [
          libraryEntry({
            item: item({ id: 'simkl-100' }),
            lastWatchedAt: '2026-07-31T21:00:00Z',
            watchedEpisodes: [
              { season: 1, number: 1 },
              { season: 1, number: 2, watchedAt: '2026-07-31T21:00:00Z' },
            ],
          }),
        ],
      }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].episodes).toEqual([2]);
  });

  test('an anime episode entry carries no season (absolute numbering)', () => {
    const entries = simklDiaryEntries(
      library({
        anime: [
          libraryEntry({
            item: item({ id: 'simkl-200', type: 'ANIME', title: 'KAMUI' }),
            watchedEpisodes: [
              { season: 1, number: 5, watchedAt: '2026-07-31T18:00:00Z' },
            ],
          }),
        ],
      }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].season).toBeUndefined();
    expect(entries[0].episodes).toEqual([5]);
    expect(entries[0].id).toBe('simkl-200-s1e5');
  });
});

describe('simklDiaryEntries — plays (movies & anime films)', () => {
  test('a movie with a last-watched instant is one play entry, no episodes', () => {
    const entries = simklDiaryEntries(
      library({
        movies: [
          libraryEntry({
            item: item({ id: 'simkl-300', type: 'MOVIE' }),
            status: 'completed',
            lastWatchedAt: '2026-07-29T20:00:00Z',
          }),
        ],
      }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: 'simkl-300',
      provider: 'simkl',
      watchedAt: '2026-07-29T20:00:00Z',
    });
    expect(entries[0].episodes).toBeUndefined();
  });

  test('an undated movie yields no entry', () => {
    const entries = simklDiaryEntries(
      library({
        movies: [
          libraryEntry({
            item: item({ id: 'simkl-300', type: 'MOVIE' }),
            status: 'plantowatch',
          }),
        ],
      }),
    );
    expect(entries).toHaveLength(0);
  });

  test('an anime film collapses to one play, dated by its episode instant when needed', () => {
    const entries = simklDiaryEntries(
      library({
        anime: [
          libraryEntry({
            item: item({ id: 'simkl-400', type: 'ANIME', isFilm: true }),
            status: 'completed',
            watchedEpisodes: [
              { season: 1, number: 1, watchedAt: '2026-07-28T19:00:00Z' },
            ],
          }),
        ],
      }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('simkl-400');
    expect(entries[0].watchedAt).toBe('2026-07-28T19:00:00Z');
    expect(entries[0].episodes).toBeUndefined();
  });
});

describe('simklDiaryEntries — window', () => {
  test('caps the projection at the 500 newest entries', () => {
    const watchedEpisodes: SimklWatchedEpisode[] = Array.from(
      { length: 510 },
      (_, index) => ({
        season: 1,
        number: index + 1,
        // Episode N watched N minutes after midnight — higher N is newer.
        watchedAt: new Date(
          Date.UTC(2026, 0, 1, 0, index),
        ).toISOString(),
      }),
    );
    const entries = simklDiaryEntries(
      library({
        shows: [libraryEntry({ item: item({ id: 'simkl-100' }), watchedEpisodes })],
      }),
    );
    expect(entries).toHaveLength(500);
    // The oldest 10 fell off; the newest survived.
    expect(entries[0].episodes).toEqual([510]);
    expect(entries.at(-1)?.episodes).toEqual([11]);
  });
});
