import { describe, expect, it } from 'bun:test';

import { animeSeasonAt, animeSeasonLabel } from './season';

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
