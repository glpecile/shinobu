import { describe, expect, test } from 'bun:test';

import type { NormalizedSeason } from '@/types/media';
import {
  formatRuntime,
  seasonRuntimeMinutes,
  seriesRuntimeMinutes,
} from './runtime';

describe('formatRuntime', () => {
  test('surfaces days past 24h', () => {
    expect(formatRuntime(1440 * 2 + 180)).toBe('2d 3h');
    expect(formatRuntime(1440)).toBe('1d');
  });

  test('formats sub-day totals as "Xh Ym" or "Xh"', () => {
    expect(formatRuntime(135)).toBe('2h 15m');
    expect(formatRuntime(120)).toBe('2h');
  });

  test('formats under-hour totals as minutes', () => {
    expect(formatRuntime(45)).toBe('45m');
  });

  test('zero or non-finite reads as "—" (never "0m")', () => {
    expect(formatRuntime(0)).toBe('—');
    expect(formatRuntime(-5)).toBe('—');
    expect(formatRuntime(Number.NaN)).toBe('—');
  });
});

describe('season/series runtime sums', () => {
  const season: NormalizedSeason = {
    number: 1,
    title: 'Season 1',
    episodes: [
      { number: 1, title: 'A', runtime: 45 },
      { number: 2, title: 'B', runtime: 50 },
      { number: 3, title: 'C' }, // runtime absent — skip
    ],
  };

  test('seasonRuntimeMinutes skips absent runtimes', () => {
    expect(seasonRuntimeMinutes(season)).toBe(95);
  });

  test('seriesRuntimeMinutes sums across seasons', () => {
    expect(seriesRuntimeMinutes([season, season])).toBe(190);
  });
});