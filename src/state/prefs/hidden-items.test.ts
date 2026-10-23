import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { describe, expect, mock, test } from 'bun:test';

GlobalRegistrator.register();
const { act, renderHook } = await import('@testing-library/react');

// Native MMKV cannot load under bun; preserve its key-change notifications.
const store = new Map<string, string | boolean>();
const listeners = new Set<(key: string) => void>();
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => store.get(key),
    set: (key: string, value: string | boolean) => {
      store.set(key, value);
      for (const listener of listeners) listener(key);
    },
    remove: (key: string) => {
      const removed = store.delete(key);
      if (removed) for (const listener of listeners) listener(key);
      return removed;
    },
    getAllKeys: () => [...store.keys()],
    addOnValueChangedListener: (listener: (key: string) => void) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  }),
}));

const { setDiaryDayCollapsed, useCollapsedDiaryDays } = await import('./collapsed-diary-days');
const { setSectionCollapsed } = await import('./collapsed-sections');
const { hideItem, hideList, unhideItem, unhideList, useHiddenItems, useHiddenLists, visibleByIds, visibleItems } = await import('./hidden-items');

const items = [{ id: 'trakt-1' }, { id: 'trakt-2' }, { id: 'trakt-3' }];

test('preference snapshots change only when their own keys change', () => {
  const read = renderHook(() => ({
    items: useHiddenItems(),
    lists: useHiddenLists(),
    days: useCollapsedDiaryDays(),
  }));
  try {
    const initial = read.result.current;
    act(() => setSectionCollapsed('trending', true));
    expect(read.result.current.items).toBe(initial.items);
    expect(read.result.current.lists).toBe(initial.lists);
    expect(read.result.current.days).toBe(initial.days);

    act(() => hideItem({ id: 'trakt-1', title: 'Film' }));
    expect(read.result.current.lists).toBe(initial.lists);
    const hiddenItems = read.result.current.items;

    act(() => hideList({ id: 'watchlist', title: 'Watchlist' }));
    expect(read.result.current.items).toBe(hiddenItems);
    expect(read.result.current.days).toBe(initial.days);

    act(() => setDiaryDayCollapsed('2026-10-23', true));
    expect(read.result.current).toEqual({
      items: [{ id: 'trakt-1', title: 'Film' }],
      lists: [{ id: 'watchlist', title: 'Watchlist' }],
      days: new Set(['2026-10-23']),
    });

    act(() => {
      unhideItem('trakt-1');
      unhideList('watchlist');
      setDiaryDayCollapsed('2026-10-23', false);
    });
    expect(read.result.current).toEqual({ items: [], lists: [], days: new Set() });
  } finally {
    read.unmount();
    store.clear();
  }
});

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

  // The stronger half of the identity contract, and the load-bearing one: with
  // `visibleItems`'s weaker short-circuit, hiding one unrelated item anywhere
  // would hand Up Next a fresh array on every render and re-break the plan 0024
  // KTD4 memoization on Continue Watching and Calendar.
  test('returns the same array when the hidden set matches none of the rows', () => {
    expect(
      visibleByIds(rows, [{ id: 'trakt-999', title: 'Elsewhere' }], idsOf),
    ).toBe(rows);
  });
});
