import { describe, expect, mock, test } from 'bun:test';

// Import-time stub only: MMKV doesn't load under bun. `visibleItems` itself is
// pure — the store is never consulted by anything this file asserts.
const store = new Map<string, string>();
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => store.get(key),
    set: (key: string, value: string) => store.set(key, value),
    remove: (key: string) => store.delete(key),
    getAllKeys: () => [...store.keys()],
    addOnValueChangedListener: () => ({ remove() {} }),
  }),
}));

const { visibleByIds, visibleItems } = await import('./hidden-items');

const items = [{ id: 'trakt-1' }, { id: 'trakt-2' }, { id: 'trakt-3' }];

describe('visibleItems', () => {
  // The perf contract behind plan 0024 U7: a fresh array every render broke
  // React Compiler's memoization for every card in a long carousel.
  test('returns the very array it was given when nothing is hidden', () => {
    expect(visibleItems(items, [])).toBe(items);
  });

  test('drops hidden ids and keeps the rest in order', () => {
    expect(visibleItems(items, [{ id: 'trakt-2', title: 'Show 2' }])).toEqual([
      { id: 'trakt-1' },
      { id: 'trakt-3' },
    ]);
  });

  test('ignores hidden ids that are not in the list', () => {
    expect(visibleItems(items, [{ id: 'anilist-9', title: 'Elsewhere' }])).toEqual(
      items,
    );
  });
});

/** A merged watchlist entry's shape, reduced to what the filter reads. */
interface MergedRow {
  key: string;
  ids: string[];
}

const idsOf = (row: MergedRow) => row.ids;

describe('visibleByIds (plan 0031 KTD-13)', () => {
  const rows: MergedRow[] = [
    { key: 'a', ids: ['trakt-1', 'letterboxd-heat'] },
    { key: 'b', ids: ['anilist-2'] },
    { key: 'c', ids: ['letterboxd-drive'] },
  ];

  test('drops a merged row when ANY contributing id is hidden (R30)', () => {
    // The bug this exists to prevent: hiding a film from the Letterboxd row and
    // then watching it reappear in the merged grid as its Trakt twin.
    expect(
      visibleByIds(rows, [{ id: 'letterboxd-heat', title: 'Heat' }], idsOf).map(
        (row) => row.key,
      ),
    ).toEqual(['b', 'c']);
  });

  test('returns the very array it was given when nothing is hidden', () => {
    expect(visibleByIds(rows, [], idsOf)).toBe(rows);
  });

  // The stronger half of the identity contract, and the load-bearing one: with
  // `visibleItems`'s weaker short-circuit, hiding one unrelated item anywhere
  // would hand Up Next a fresh array on every render and re-break the plan 0024
  // KTD4 memoization on Continue Watching and Calendar.
  test('returns the same array when the hidden set matches none of the rows', () => {
    expect(
      visibleByIds(rows, [{ id: 'trakt-999', title: 'Elsewhere' }], idsOf),
    ).toBe(rows);
  });

  test('a hide is global, not per-surface: one id suppresses every surface', () => {
    // The accepted consequence stated in R30 rather than left to a bug report —
    // hiding an anime from the watchlist grid also removes it from the row that
    // `visibleItems` filters ("Your Anime").
    const hidden = [{ id: 'anilist-2', title: 'Anime 2' }];
    expect(visibleByIds(rows, hidden, idsOf).map((row) => row.key)).toEqual([
      'a',
      'c',
    ]);
    expect(visibleItems([{ id: 'anilist-2' }, { id: 'anilist-3' }], hidden)).toEqual([
      { id: 'anilist-3' },
    ]);
  });
});
