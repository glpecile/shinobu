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

const { visibleItems } = await import('./hidden-items');

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
