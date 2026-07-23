import { beforeEach, describe, expect, mock, test } from 'bun:test';

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

const { checkAndStoreHash, clearStoredHash } = await import('./hash-guard');

describe('checkAndStoreHash', () => {
  beforeEach(() => {
    store.clear();
  });

  test('the same schedule hash twice reports "replaced" then "skipped"', () => {
    expect(checkAndStoreHash('a/1/2/2026-07-24T00:00:00.000Z')).toBe('replaced');
    expect(checkAndStoreHash('a/1/2/2026-07-24T00:00:00.000Z')).toBe('skipped');
  });

  test('a changed schedule reports "replaced" and updates the stored hash', () => {
    checkAndStoreHash('first');
    expect(checkAndStoreHash('second')).toBe('replaced');
    expect(checkAndStoreHash('second')).toBe('skipped');
  });

  test('an empty schedule after a non-empty one is a change, not a skip', () => {
    checkAndStoreHash('a/1/2/2026-07-24T00:00:00.000Z');
    expect(checkAndStoreHash('')).toBe('replaced');
  });

  test('clearStoredHash forces the next check to report "replaced"', () => {
    checkAndStoreHash('a/1/2/2026-07-24T00:00:00.000Z');
    clearStoredHash();
    expect(checkAndStoreHash('a/1/2/2026-07-24T00:00:00.000Z')).toBe('replaced');
  });
});
