import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

import { pickMovieMatch } from './pick-movie-match';

function movie(id: string, title: string, year?: number): NormalizedMediaItem {
  return {
    id: `trakt-${id}`,
    title,
    coverImage: '',
    ...(year != null ? { year } : {}),
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-17T00:00:00.000Z',
    externalIds: { trakt: Number(id) },
  };
}

const kubrick = movie('1', '2001: A Space Odyssey', 1968);
const nolan = movie('2', 'The Odyssey', 2026);

describe('pickMovieMatch', () => {
  test('prefers the exact-year match over a more popular top hit', () => {
    expect(pickMovieMatch([kubrick, nolan], 2026)).toBe(nolan);
  });

  test('accepts a ±1 year offset (festival vs wide release)', () => {
    expect(pickMovieMatch([kubrick, nolan], 2025)).toBe(nolan);
  });

  test('returns null when the year is known and nothing lands close', () => {
    // The regression from the field: falling back to the top hit resolved
    // Nolan's The Odyssey (2026) to Kubrick's 2001 — no match is correct.
    expect(pickMovieMatch([kubrick], 2026)).toBeNull();
  });

  test('falls back to the top hit only for yearless items', () => {
    expect(pickMovieMatch([kubrick, nolan], undefined)).toBe(kubrick);
  });

  test('ignores non-movie rows and empty results', () => {
    const show = { ...movie('3', 'The Odyssey', 2026), type: 'TV' as const };
    expect(pickMovieMatch([show], 2026)).toBeNull();
    expect(pickMovieMatch([], undefined)).toBeNull();
  });

  test('exact match wins over an earlier ±1 candidate', () => {
    const remake = movie('4', 'The Odyssey', 2025);
    expect(pickMovieMatch([remake, nolan], 2026)).toBe(nolan);
  });
});
