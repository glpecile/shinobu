import { describe, expect, test } from 'bun:test';

import type { MediaProgress } from '@/lib/media-progress';
import type { NormalizedMediaItem } from '@/types/media';

import { airingNote, seasonRows, seasonShelf, type SeasonShelf } from './season-shelves';

function item(id: string): NormalizedMediaItem {
  return {
    id,
    title: id,
    type: 'ANIME',
    coverImage: '',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-11-07T00:00:00.000Z',
    externalIds: {},
  };
}

const progress = (current: number, completed = false): MediaProgress =>
  ({ watched: current > 0 || completed, completed, current, unit: 'episode' });

describe('seasonShelf', () => {
  test('completed wins over a watching status', () => {
    expect(seasonShelf(progress(12, true), 'watching')).toBe('seen');
  });
  test('a watching status counts before the first logged episode', () => {
    expect(seasonShelf(progress(0), 'watching')).toBe('watching');
  });
  test('a planned title with progress is being watched', () => {
    expect(seasonShelf(progress(2), 'planned')).toBe('watching');
  });
  test('planned, and untracked', () => {
    expect(seasonShelf(progress(0), 'planned')).toBe('planned');
    expect(seasonShelf(progress(0), undefined)).toBe('rest');
  });
});

describe('seasonRows', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map(item);
  const shelves: Record<string, SeasonShelf> = { a: 'rest', b: 'watching', c: 'rest', d: 'watching', e: 'seen' };
  const shelfOf = (entry: NormalizedMediaItem) => shelves[entry.id];
  const nextAiring = { d: { episode: 3, airingAt: '2026-11-08T12:00:00.000Z' } };

  test('shelves in order, watching soonest first, posters chunked to columns', () => {
    const rows = seasonRows(items, shelfOf, nextAiring, { folded: new Set(), columns: 2, now: new Date('2026-11-07T00:00:00Z') });
    expect(rows.map((row) => (row.kind === 'posters' ? row.items.map((entry) => entry.id).join('') : row.key))).toEqual([
      'watching', 'db', 'seen', 'e', 'rest', 'ac',
    ]);
    expect(rows[0]).toMatchObject({ kind: 'head', count: 2, open: true, next: nextAiring.d });
  });

  test('a folded shelf keeps its head and drops its titles', () => {
    const rows = seasonRows(items, shelfOf, nextAiring, { folded: new Set(['rest']), now: new Date('2026-11-07T00:00:00Z') });
    expect(rows.at(-1)).toMatchObject({ kind: 'head', key: 'rest', open: false });
  });

  test('expired airing pointers do not sort ahead of upcoming episodes', () => {
    const rows = seasonRows([items[1], items[3]], shelfOf, {
      b: { episode: 1, airingAt: '2026-11-07T10:00:00.000Z' },
      d: nextAiring.d,
    }, { folded: new Set(['watching']), now: new Date('2026-11-07T12:00:00.000Z') });
    expect(rows[0]).toMatchObject({ key: 'watching', next: nextAiring.d });
  });

  test('with nothing tracked, the plain catalogue with no heads, whatever is folded', () => {
    const rows = seasonRows(items, () => 'rest', {}, { folded: new Set(['rest']), now: new Date('2026-11-07T00:00:00Z') });
    expect(rows.map((row) => row.kind)).toEqual(['entry', 'entry', 'entry', 'entry', 'entry']);
  });
});

// Local times: the label reads the user's calendar day and clock.
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 30).toISOString();

describe('airingNote', () => {
  const now = new Date(2026, 10, 7, 12, 0);

  test('relative day and local time, premiere by name', () => {
    expect(airingNote({ episode: 7, airingAt: at(7, 21) }, now)).toBe('E7 · Today 21:30');
    expect(airingNote({ episode: 1, airingAt: at(8, 9) }, now)).toBe('Premiere · Tomorrow 09:30');
  });
  test('a weekday within the week, weekday and date from a week out', () => {
    expect(airingNote({ episode: 2, airingAt: at(11, 9) }, now)).toBe('E2 · Wed 09:30');
    expect(airingNote({ episode: 8, airingAt: at(14, 9) }, now)).toBe('E8 · Sat, Nov 14');
  });
  test('nothing once the pointer has aired', () => {
    expect(airingNote({ episode: 6, airingAt: at(7, 9) }, now)).toBeUndefined();
  });
});
