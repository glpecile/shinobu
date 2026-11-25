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

const { connectProviderSession, getProviderClientId, providerSessionEpoch, setProviderSession } =
  await import('./tokens');

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

test('a refresh keeps the session epoch and a reconnect over the kept session changes it', () => {
  values.set('connectedAt.trakt', '1');
  values.set('session.trakt', JSON.stringify({ accessToken: 'a' }));

  setProviderSession('trakt', { accessToken: 'b' });
  expect(providerSessionEpoch('trakt')).toBe(1);

  connectProviderSession('trakt', { accessToken: 'c' });
  expect(providerSessionEpoch('trakt')).not.toBe(1);
});
