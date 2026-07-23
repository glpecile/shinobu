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

const { getNotificationsEnabled, setNotificationsEnabled } = await import(
  './notifications'
);

describe('notifications pref', () => {
  beforeEach(() => {
    store.clear();
  });

  test('defaults to off', () => {
    expect(getNotificationsEnabled()).toBe(false);
  });

  test('set/get round-trips true and false', () => {
    setNotificationsEnabled(true);
    expect(getNotificationsEnabled()).toBe(true);
    setNotificationsEnabled(false);
    expect(getNotificationsEnabled()).toBe(false);
  });
});
