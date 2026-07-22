import { describe, expect, mock, test } from 'bun:test';

// serializd.ts imports the platform transport (native nitro client) + MMKV,
// neither of which loads under bun. Stub both so the pure key builders import.
mock.module('@/lib/providers/serializd/transport', () => ({
  serializdFetch: async () => new Response('{}'),
  serializdBaseUrl: 'https://api.test',
}));
// Functional (Map-backed) so it stays correct even if this mock wins the global
// registry and another suite's session module binds to it (mock.module is global
// + the module cache binds tokens.ts to whichever mock loaded it first).
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

const { serializdQueryKeys } = await import('./serializd');

describe('serializdQueryKeys', () => {
  test('every key is rooted at "serializd"', () => {
    expect(serializdQueryKeys.all[0]).toBe('serializd');
    expect(serializdQueryKeys.diary('gian')[0]).toBe('serializd');
    expect(serializdQueryKeys.progress('gian', 1396)[0]).toBe('serializd');
  });

  test('diary + progress keys include the username (no cross-account leakage)', () => {
    expect(serializdQueryKeys.diary('gian')).toEqual(['serializd', 'diary', 'gian']);
    expect(serializdQueryKeys.progress('nina', 1396)).toEqual([
      'serializd',
      'progress',
      'nina',
      1396,
    ]);
    // Reconnecting as a different account yields a different key.
    expect(serializdQueryKeys.diary('gian')).not.toEqual(serializdQueryKeys.diary('nina'));
  });
});
