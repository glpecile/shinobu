import { describe, expect, test } from 'bun:test';

import {
  normalizeAniListListEntry,
  normalizeAniListMedia,
  type AniListListEntry,
  type AniListMedia,
} from './normalize';

const NOW_ISO = '2026-07-14T00:00:00.000Z';

const SERIES: AniListMedia = {
  id: 21,
  idMal: 21,
  type: 'ANIME',
  format: 'TV',
  title: { english: 'One Piece', romaji: 'ONE PIECE', native: 'ONE PIECE' },
  description: 'Gold Roger was known as the <i>Pirate King</i>.<br><br>The end.',
  coverImage: { extraLarge: 'https://img/xl.png', large: 'https://img/l.png' },
  bannerImage: 'https://img/banner.png',
  seasonYear: 1999,
  duration: 24,
  genres: ['Action', 'Adventure'],
  averageScore: 88,
  episodes: null,
  chapters: null,
};

const FILM: AniListMedia = {
  id: 199,
  type: 'ANIME',
  format: 'MOVIE',
  title: { english: 'Spirited Away', romaji: 'Sen to Chihiro no Kamikakushi' },
  startDate: { year: 2001 },
  episodes: 1,
  averageScore: 91,
};

describe('normalizeAniListMedia', () => {
  test('normalizes a series with english title, stripped html, 0–10 rating', () => {
    const item = normalizeAniListMedia(SERIES, NOW_ISO);
    expect(item).toMatchObject({
      id: 'anilist-21',
      title: 'One Piece',
      coverImage: 'https://img/xl.png',
      backdropImage: 'https://img/banner.png',
      overview: 'Gold Roger was known as the Pirate King.\n\nThe end.',
      year: 1999,
      runtime: 24,
      genres: ['Action', 'Adventure'],
      rating: 8.8,
      type: 'ANIME',
      currentProgress: 0,
      progressUnit: 'episode',
      lastUpdated: NOW_ISO,
      externalIds: { anilist: 21 },
    });
    // Ongoing show: AniList has no total — the field must stay absent.
    expect(item.totalEpisodes).toBeUndefined();
    expect(item.isFilm).toBeUndefined();
  });

  test('a MOVIE-format entry is ANIME with isFilm (plan.md 1.3 edge case)', () => {
    const item = normalizeAniListMedia(FILM, NOW_ISO);
    expect(item.type).toBe('ANIME');
    expect(item.isFilm).toBe(true);
    expect(item.year).toBe(2001);
    expect(item.totalEpisodes).toBe(1);
  });

  test('falls back to romaji when there is no english title', () => {
    const item = normalizeAniListMedia(
      { ...FILM, title: { romaji: 'Sen to Chihiro no Kamikakushi' } },
      NOW_ISO,
    );
    expect(item.title).toBe('Sen to Chihiro no Kamikakushi');
  });

  test('manga counts chapters, not episodes', () => {
    const item = normalizeAniListMedia(
      { id: 30002, type: 'MANGA', format: 'MANGA', title: { romaji: 'Berserk' }, chapters: 380 },
      NOW_ISO,
    );
    expect(item.type).toBe('MANGA');
    expect(item.progressUnit).toBe('chapter');
    expect(item.totalEpisodes).toBe(380);
  });
});

describe('normalizeAniListListEntry', () => {
  test('carries the entry progress and updatedAt as an ISO instant', () => {
    const entry: AniListListEntry = {
      status: 'CURRENT',
      progress: 1090,
      repeat: 0,
      updatedAt: 1_752_400_000,
      media: SERIES,
    };
    const item = normalizeAniListListEntry(entry, NOW_ISO);
    expect(item.currentProgress).toBe(1090);
    expect(item.lastUpdated).toBe(new Date(1_752_400_000 * 1000).toISOString());
  });

  test('missing updatedAt keeps the supplied now instant', () => {
    const item = normalizeAniListListEntry({ media: SERIES }, NOW_ISO);
    expect(item.lastUpdated).toBe(NOW_ISO);
    expect(item.currentProgress).toBe(0);
  });
});
