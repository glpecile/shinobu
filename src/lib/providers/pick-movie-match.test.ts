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

  // The field regression: a 2025 film whose title a much older, far more
  // popular film also carries. Trakt/TMDB rank the classic first.
  describe('same-title different-year (Labyrinth / Motor City)', () => {
    const jareth = movie('10', 'Labyrinth', 1986);
    const labyrinth2025 = movie('11', 'Labyrinth', 2025);

    test('picks the exact-year film even when the classic ranks first', () => {
      expect(pickMovieMatch([jareth, labyrinth2025], 2025, 'Labyrinth')).toBe(
        labyrinth2025,
      );
    });

    test('returns null when only the wrong-year film exists', () => {
      expect(pickMovieMatch([jareth], 2025, 'Labyrinth')).toBeNull();
    });

    test('an exact title beats a substring title at the same year', () => {
      const partial = movie('12', 'Labyrinth of Cinema', 2025);
      expect(
        pickMovieMatch([partial, labyrinth2025], 2025, 'Labyrinth'),
      ).toBe(labyrinth2025);
    });

    test('matches titles case- and diacritic-insensitively', () => {
      const amelie = movie('13', 'Amélie', 2001);
      const other = movie('14', 'Amelie and Friends', 2001);
      expect(pickMovieMatch([other, amelie], 2001, 'amelie')).toBe(amelie);
    });

    test('two candidates straddling the year are ambiguous, not a match', () => {
      const before = movie('15', 'Motor City', 2024);
      const after = movie('16', 'Motor City', 2026);
      expect(pickMovieMatch([before, after], 2025, 'Motor City')).toBeNull();
    });

    test('takes the ±1 candidate when it is the only one in the window', () => {
      const before = movie('17', 'Motor City', 2024);
      expect(pickMovieMatch([before, jareth], 2025, 'Motor City')).toBe(before);
    });

    test('an exact title disambiguates an otherwise crowded ±1 window', () => {
      const exact = movie('18', 'Motor City', 2024);
      const partial = movie('19', 'Motor City Blues', 2026);
      expect(pickMovieMatch([partial, exact], 2025, 'Motor City')).toBe(exact);
    });
  });
});
