import { expect, mock, test } from 'bun:test';

const values = new Map<string, string>();
let serverRendering = false;

mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => {
      if (serverRendering) throw new Error('Storage is unavailable during server rendering');
      return values.get(key);
    },
    set: (key: string, value: string) => values.set(key, value),
    remove: (key: string) => values.delete(key),
  }),
}));

const { getProviderClientId, providerSessionEpoch, setProviderSession } = await import('./tokens');

test('web server rendering has no device client override', () => {
  const original = process.env.EXPO_OS;
  process.env.EXPO_OS = 'web';
  serverRendering = true;
  try {
    expect(getProviderClientId('simkl')).toBeNull();
  } finally {
    serverRendering = false;
    if (original === undefined) delete process.env.EXPO_OS;
    else process.env.EXPO_OS = original;
  }
});

test('a refresh keeps the session epoch and a reconnect after a refused refresh changes it', () => {
  values.set('connectedAt.hardcover', '1');
  values.set('session.hardcover', JSON.stringify({ accessToken: 'a' }));

  setProviderSession('hardcover', { accessToken: 'b' });
  expect(providerSessionEpoch('hardcover')).toBe(1);

  setProviderSession('hardcover', { accessToken: 'b', reconnectNeeded: true });
  setProviderSession('hardcover', { accessToken: 'c' });
  expect(providerSessionEpoch('hardcover')).not.toBe(1);
});
