import { expect, mock, test } from 'bun:test';

mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: () => { throw new Error('Storage is unavailable during server rendering'); },
  }),
}));

const { getProviderClientId } = await import('./tokens');

test('web server rendering has no device client override', () => {
  const original = process.env.EXPO_OS;
  process.env.EXPO_OS = 'web';
  try {
    expect(getProviderClientId('simkl')).toBeNull();
  } finally {
    if (original === undefined) delete process.env.EXPO_OS;
    else process.env.EXPO_OS = original;
  }
});
