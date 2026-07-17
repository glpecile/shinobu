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
});
