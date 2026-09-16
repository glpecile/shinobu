import { describe, expect, test } from 'bun:test';

import { episodeNeighbours } from './episode-neighbours';

const seasons = [
  { number: 0, title: 'Specials', episodes: [{ number: 1, title: 'OVA' }] },
  { number: 2, title: 'Season 2', episodes: [{ number: 1, title: '' }] },
  { number: 1, title: 'Season 1', episodes: [{ number: 2, title: '' }, { number: 1, title: '' }] },
];

describe('episodeNeighbours', () => {
  test('crosses season boundaries and stops at the ends', () => {
    expect(episodeNeighbours(seasons, 1, 1)).toEqual({ next: { season: 1, number: 2 } });
    expect(episodeNeighbours(seasons, 1, 2)).toEqual({
      prev: { season: 1, number: 1 },
      next: { season: 2, number: 1 },
    });
    expect(episodeNeighbours(seasons, 2, 1)).toEqual({ prev: { season: 1, number: 2 } });
  });

  test('specials never neighbour regular episodes', () => {
    expect(episodeNeighbours(seasons, 0, 1)).toEqual({});
    expect(episodeNeighbours(seasons, 3, 1)).toEqual({});
  });
});
