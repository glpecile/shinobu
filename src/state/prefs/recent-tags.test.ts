import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

// Import-time stub only: MMKV doesn't load under bun. Kept API-identical to the
// stub in hidden-items.test.ts — `mock.module` is a process-wide registry, so
// whichever file registers first serves every prefs module in the run
// (docs/solutions/bun-mock-module-leaks-across-suites.md).
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

const { getRecentTags, mergeRecentTags, recordRecentTags } = await import('./recent-tags');
// Asserted through the module's own storage handle, never the Map above: the
// `mock.module` registry is process-wide, so in a full run the stub registered
// by hidden-items.test.ts may be the one serving this module
// (docs/solutions/bun-mock-module-leaks-across-suites.md).
const { prefsStorage } = await import('./storage');
const KEY = 'recentTags';

describe('mergeRecentTags', () => {
  test('puts the newest tags first and keeps the rest in order', () => {
    expect(mergeRecentTags(['b', 'c'], ['a'])).toEqual(['a', 'b', 'c']);
  });

  test('preserves the order within a single batch', () => {
    expect(mergeRecentTags([], ['first', 'second', 'third'])).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  test('de-dupes case-insensitively, keeping the newest casing once', () => {
    expect(mergeRecentTags(['rewatch', 'nyff'], ['ReWatch'])).toEqual([
      'ReWatch',
      'nyff',
    ]);
    expect(mergeRecentTags([], ['dupe', 'DUPE'])).toEqual(['dupe']);
  });

  test('drops blank and whitespace-only tags, trimming the rest', () => {
    expect(mergeRecentTags([], ['  spaced  ', '', '   '])).toEqual(['spaced']);
  });

  test('caps the list at 30, dropping the oldest', () => {
    const existing = Array.from({ length: 30 }, (_, index) => `old-${index}`);
    const merged = mergeRecentTags(existing, ['fresh']);
    expect(merged).toHaveLength(30);
    expect(merged[0]).toBe('fresh');
    expect(merged.at(-1)).toBe('old-28');
    expect(merged).not.toContain('old-29');
  });

  test('an empty batch leaves the list untouched', () => {
    expect(mergeRecentTags(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});

describe('recordRecentTags', () => {
  // Every read in state/prefs is gated on `isServer()` (`typeof window ===
  // 'undefined'`, docs/solutions/expo-web-ssr-mmkv-storage-on-server.md), and
  // bun has no `window` — so the store path only runs with one faked in. Scoped
  // to this suite and removed afterwards: bun shares one process across files.
  const globals = globalThis as { window?: unknown };
  beforeEach(() => {
    globals.window = {};
    prefsStorage.remove(KEY);
  });
  afterAll(() => {
    delete globals.window;
  });

  test('the SSR guard holds: no window, no storage access', () => {
    delete globals.window;
    recordRecentTags(['ignored']);
    expect(prefsStorage.getString(KEY)).toBeUndefined();
    expect(getRecentTags()).toEqual([]);
  });

  test('starts empty and records the first log most-recent-first', () => {
    expect(getRecentTags()).toEqual([]);
    recordRecentTags(['criterion collection', 'nyff']);
    expect(getRecentTags()).toEqual(['criterion collection', 'nyff']);
  });

  test('a later log moves its tags to the front', () => {
    recordRecentTags(['a', 'b']);
    recordRecentTags(['c']);
    recordRecentTags(['B']);
    expect(getRecentTags()).toEqual(['B', 'c', 'a']);
  });

  test('an empty list writes nothing at all', () => {
    recordRecentTags([]);
    expect(prefsStorage.getString(KEY)).toBeUndefined();
    expect(getRecentTags()).toEqual([]);
  });

  test('a corrupt stored value degrades to an empty list', () => {
    prefsStorage.set(KEY, 'not json');
    expect(getRecentTags()).toEqual([]);
    recordRecentTags(['fresh']);
    expect(getRecentTags()).toEqual(['fresh']);
  });
});
