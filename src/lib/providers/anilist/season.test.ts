import { describe, expect, it } from 'bun:test';

import {
  animeSeasonAt,
  animeSeasonLabel,
  parseAnimeFormatFilter,
  parseAnimeSeasonWindow,
} from './season';

describe('animeSeasonAt', () => {
  it('advances each season 10 local calendar days early, including the year', () => {
    const boundaries = [
      { month: 2, day: 22, before: 'WINTER', after: 'SPRING', year: 2026 },
      { month: 5, day: 21, before: 'SPRING', after: 'SUMMER', year: 2026 },
      { month: 8, day: 21, before: 'SUMMER', after: 'FALL', year: 2026 },
      { month: 11, day: 22, before: 'FALL', after: 'WINTER', year: 2027 },
    ] as const;
    for (const { month, day, before, after, year } of boundaries) {
      expect(animeSeasonAt(new Date(2026, month, day - 1, 23, 59, 59))).toEqual({
        season: before,
        year: 2026,
      });
      const date = new Date(2026, month, day);
      expect(animeSeasonAt(date)).toEqual({ season: after, year });
      expect(date.getDate()).toBe(day);
    }
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

});

describe('parseAnimeFormatFilter', () => {
  it('accepts the three filters and falls back to ALL', () => {
    expect(parseAnimeFormatFilter('MOVIE')).toBe('MOVIE');
    expect(parseAnimeFormatFilter('TV')).toBe('TV');
    expect(parseAnimeFormatFilter('movie')).toBe('ALL');
    expect(parseAnimeFormatFilter(undefined)).toBe('ALL');
  });
});
