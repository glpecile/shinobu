import { describe, expect, it } from 'bun:test';

import {
  animeSeasonAt,
  animeSeasonLabel,
  parseAnimeFormatFilter,
  parseAnimeSeasonWindow,
} from './season';

describe('animeSeasonAt', () => {
  it('maps each quarter to its AniList season', () => {
    expect(animeSeasonAt(new Date(2026, 0, 15))).toEqual({ season: 'WINTER', year: 2026 });
    expect(animeSeasonAt(new Date(2026, 2, 31))).toEqual({ season: 'WINTER', year: 2026 });
    expect(animeSeasonAt(new Date(2026, 3, 1))).toEqual({ season: 'SPRING', year: 2026 });
    expect(animeSeasonAt(new Date(2026, 6, 14))).toEqual({ season: 'SUMMER', year: 2026 });
    expect(animeSeasonAt(new Date(2026, 11, 31))).toEqual({ season: 'FALL', year: 2026 });
  });
});

describe('animeSeasonLabel', () => {
  it('formats the season name and year', () => {
    expect(animeSeasonLabel({ season: 'SUMMER', year: 2026 })).toBe('Summer 2026');
    expect(animeSeasonLabel({ season: 'WINTER', year: 2027 })).toBe('Winter 2027');
  });
});

describe('parseAnimeSeasonWindow', () => {
  const fallback = { season: 'SUMMER', year: 2026 } as const;

  it('reads a well-formed pair', () => {
    expect(parseAnimeSeasonWindow({ season: 'FALL', year: '2019' }, fallback)).toEqual({
      season: 'FALL',
      year: 2019,
    });
  });

  it('falls back field by field on garbage', () => {
    expect(parseAnimeSeasonWindow({ season: 'autumn', year: '2019' }, fallback)).toEqual({
      season: 'SUMMER',
      year: 2019,
    });
    expect(parseAnimeSeasonWindow({ season: 'WINTER', year: '19x' }, fallback)).toEqual({
      season: 'WINTER',
      year: 2026,
    });
    expect(parseAnimeSeasonWindow({ season: 'WINTER', year: '1800' }, fallback)).toEqual({
      season: 'WINTER',
      year: 2026,
    });
    expect(parseAnimeSeasonWindow({}, fallback)).toEqual(fallback);
  });

  it('accepts the whole-year scope, which labels as the bare year', () => {
    const year = parseAnimeSeasonWindow({ season: 'YEAR', year: '2026' }, fallback);
    expect(year).toEqual({ season: 'YEAR', year: 2026 });
    expect(animeSeasonLabel(year)).toBe('2026');
  });
});

describe('parseAnimeFormatFilter', () => {
  it('accepts the three filters and falls back to ALL', () => {
    expect(parseAnimeFormatFilter('MOVIE')).toBe('MOVIE');
    expect(parseAnimeFormatFilter('TV')).toBe('TV');
    expect(parseAnimeFormatFilter('movie')).toBe('ALL');
    expect(parseAnimeFormatFilter(undefined)).toBe('ALL');
  });
});
