import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

import { mergeCatalogueMetadata } from './merge-metadata';

const letterboxdItem: NormalizedMediaItem = {
  id: 'letterboxd-jinsei',
  title: 'Jinsei',
  coverImage: 'https://a.ltrbxd.com/poster.jpg',
  year: 2025,
  type: 'MOVIE',
  currentProgress: 0,
  progressUnit: 'episode',
  lastUpdated: '2026-07-17T00:00:00.000Z',
  externalIds: { letterboxd: 'jinsei' },
};

const catalogue: NormalizedMediaItem = {
  id: 'trakt-999',
  title: 'Jinsei',
  coverImage: 'https://trakt.example/poster.jpg',
  backdropImage: 'https://trakt.example/backdrop.jpg',
  overview: 'A man rebuilds his life.',
  year: 2025,
  runtime: 104,
  genres: ['Drama', 'Animation'],
  rating: 7.8,
  type: 'MOVIE',
  currentProgress: 0,
  progressUnit: 'episode',
  lastUpdated: '2026-07-17T00:00:00.000Z',
  externalIds: { trakt: 999, tmdb: 555, imdb: 'tt0000001' },
};

describe('mergeCatalogueMetadata', () => {
  test('fills missing metadata without touching identity or user state', () => {
    const merged = mergeCatalogueMetadata(letterboxdItem, catalogue);

    expect(merged.id).toBe('letterboxd-jinsei');
    expect(merged.title).toBe('Jinsei');
    expect(merged.coverImage).toBe('https://a.ltrbxd.com/poster.jpg');
    expect(merged.backdropImage).toBe('https://trakt.example/backdrop.jpg');
    expect(merged.overview).toBe('A man rebuilds his life.');
    expect(merged.runtime).toBe(104);
    expect(merged.genres).toEqual(['Drama', 'Animation']);
    expect(merged.rating).toBe(7.8);
  });

  test('unions external ids with the item side winning', () => {
    const merged = mergeCatalogueMetadata(letterboxdItem, catalogue);

    expect(merged.externalIds).toEqual({
      letterboxd: 'jinsei',
      trakt: 999,
      tmdb: 555,
      imdb: 'tt0000001',
    });
  });

  test('keeps existing fields over catalogue values', () => {
    const withOwnMeta: NormalizedMediaItem = {
      ...letterboxdItem,
      overview: 'Original overview.',
      rating: 9.1,
    };
    const merged = mergeCatalogueMetadata(withOwnMeta, catalogue);

    expect(merged.overview).toBe('Original overview.');
    expect(merged.rating).toBe(9.1);
    expect(merged.year).toBe(2025);
  });

  test('recovers an empty cover image from the catalogue', () => {
    const artless: NormalizedMediaItem = { ...letterboxdItem, coverImage: '' };
    const merged = mergeCatalogueMetadata(artless, catalogue);

    expect(merged.coverImage).toBe('https://trakt.example/poster.jpg');
  });

  // Both merge functions enumerate fields explicitly, so an unlisted one is
  // silently dropped — and dropping releaseDate would quietly un-gate the
  // log button for unreleased films.
  test('forwards release and home-release dates when the item lacks them', () => {
    const merged = mergeCatalogueMetadata(letterboxdItem, {
      ...catalogue,
      releaseDate: '2025-11-14',
      homeReleaseDate: '2026-01-20',
      homeReleaseKind: 'digital',
    });

    expect(merged.releaseDate).toBe('2025-11-14');
    expect(merged.homeReleaseDate).toBe('2026-01-20');
    expect(merged.homeReleaseKind).toBe('digital');
  });

  test('keeps the item’s own release date over the catalogue’s', () => {
    const merged = mergeCatalogueMetadata(
      { ...letterboxdItem, releaseDate: '2025-01-01' },
      { ...catalogue, releaseDate: '2025-11-14' },
    );

    expect(merged.releaseDate).toBe('2025-01-01');
  });
});

import { applyPrimaryMetadata } from './merge-metadata';

describe('applyPrimaryMetadata', () => {
  const item: NormalizedMediaItem = {
    id: 'trakt-1',
    title: 'Arcane',
    coverImage: 'https://trakt/poster.jpg',
    overview: 'Trakt synopsis.',
    rating: 8.5,
    year: 2021,
    type: 'TV',
    currentProgress: 5,
    progressUnit: 'episode',
    totalEpisodes: 18,
    lastUpdated: '2026-07-19T00:00:00Z',
    externalIds: { trakt: 1, tmdb: 94605 },
  };

  test('primary text fields override the item where present', () => {
    const merged = applyPrimaryMetadata(item, {
      id: 'tmdb-tv-94605',
      title: 'Arcane',
      coverImage: 'https://tmdb/poster.jpg',
      backdropImage: 'https://tmdb/backdrop.jpg',
      overview: 'TMDB synopsis.',
      rating: 8.8,
      runtime: 41,
      genres: ['Animation'],
      type: 'TV',
      currentProgress: 0,
      progressUnit: 'episode',
      totalEpisodes: 27,
      lastUpdated: '2026-07-19T01:00:00Z',
      externalIds: { tmdb: 94605, imdb: 'tt11126994' },
    });

    // Artwork is fill-only: the item already showed this poster on the card
    // the viewer tapped, so TMDB must not swap it out from under them.
    expect(merged.coverImage).toBe('https://trakt/poster.jpg');
    // …but the item carried no backdrop, so TMDB's fills the gap.
    expect(merged.backdropImage).toBe('https://tmdb/backdrop.jpg');
    expect(merged.overview).toBe('TMDB synopsis.');
    expect(merged.rating).toBe(8.8);
    expect(merged.genres).toEqual(['Animation']);
    // Identity + user state stay the item's.
    expect(merged.id).toBe('trakt-1');
    expect(merged.currentProgress).toBe(5);
    expect(merged.lastUpdated).toBe('2026-07-19T00:00:00Z');
    // totalEpisodes is fill-only: the provider's 18 (progress source) wins.
    expect(merged.totalEpisodes).toBe(18);
    // External ids merge with the item winning, primary filling gaps.
    expect(merged.externalIds).toEqual({ trakt: 1, tmdb: 94605, imdb: 'tt11126994' });
  });

  test('keeps item fields when primary lacks them, and passes through on null', () => {
    const sparse = applyPrimaryMetadata(item, {
      id: 'tmdb-tv-94605',
      title: 'Arcane',
      coverImage: '',
      type: 'TV',
      currentProgress: 0,
      progressUnit: 'episode',
      lastUpdated: '2026-07-19T01:00:00Z',
      externalIds: { tmdb: 94605 },
    });

    expect(sparse.coverImage).toBe('https://trakt/poster.jpg');
    expect(sparse.overview).toBe('Trakt synopsis.');
    expect(sparse.rating).toBe(8.5);
    expect(applyPrimaryMetadata(item, null)).toBe(item);
  });

  // The failover artwork actually exists for: a Trakt watched row or a
  // Letterboxd slug arrives artless, so TMDB's poster is the only one there is.
  test('TMDB artwork fills an artless item but never replaces existing art', () => {
    const primary: NormalizedMediaItem = {
      id: 'tmdb-tv-94605',
      title: 'Arcane',
      coverImage: 'https://tmdb/poster.jpg',
      backdropImage: 'https://tmdb/backdrop.jpg',
      type: 'TV',
      currentProgress: 0,
      progressUnit: 'episode',
      lastUpdated: '2026-07-19T01:00:00Z',
      externalIds: { tmdb: 94605 },
    };

    const artless = applyPrimaryMetadata({ ...item, coverImage: '' }, primary);
    expect(artless.coverImage).toBe('https://tmdb/poster.jpg');

    const arted = applyPrimaryMetadata(
      { ...item, backdropImage: 'https://trakt/backdrop.jpg' },
      primary,
    );
    expect(arted.coverImage).toBe('https://trakt/poster.jpg');
    expect(arted.backdropImage).toBe('https://trakt/backdrop.jpg');
  });

  // Release dates are catalogue metadata, not user state: TMDB wins, and the
  // fields must survive the explicit field enumeration (silent-drop trap).
  test('TMDB release + home-release dates override the item’s', () => {
    const merged = applyPrimaryMetadata(
      { ...item, type: 'MOVIE', releaseDate: '2020-01-01' },
      {
        id: 'tmdb-movie-1',
        title: 'Arcane',
        coverImage: '',
        type: 'MOVIE',
        currentProgress: 0,
        progressUnit: 'episode',
        lastUpdated: '2026-07-19T01:00:00Z',
        releaseDate: '2026-09-18',
        homeReleaseDate: '2026-11-25',
        homeReleaseKind: 'both',
        externalIds: { tmdb: 1 },
      },
    );

    expect(merged.releaseDate).toBe('2026-09-18');
    expect(merged.homeReleaseDate).toBe('2026-11-25');
    expect(merged.homeReleaseKind).toBe('both');
    // User state still untouched.
    expect(merged.currentProgress).toBe(5);
  });

  test('a primary without release dates leaves the item’s intact', () => {
    const merged = applyPrimaryMetadata(
      { ...item, releaseDate: '2021-11-06', homeReleaseDate: '2021-12-01' },
      {
        id: 'tmdb-tv-94605',
        title: 'Arcane',
        coverImage: '',
        type: 'TV',
        currentProgress: 0,
        progressUnit: 'episode',
        lastUpdated: '2026-07-19T01:00:00Z',
        externalIds: { tmdb: 94605 },
      },
    );

    expect(merged.releaseDate).toBe('2021-11-06');
    expect(merged.homeReleaseDate).toBe('2021-12-01');
  });
});
