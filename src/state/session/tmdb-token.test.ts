import { expect, mock, test } from 'bun:test';

mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: () => { throw new Error('Storage is unavailable during server rendering'); },
  }),
}));

const { tmdbToken } = await import('./tmdb-token');

test('server-side provider requests use the bundled TMDB token without local storage', () => {
  const original = process.env.EXPO_PUBLIC_TMDB_TOKEN;
  process.env.EXPO_PUBLIC_TMDB_TOKEN = 'builder-token';
  try {
    expect(tmdbToken()).toBe('builder-token');
  } finally {
    if (original === undefined) delete process.env.EXPO_PUBLIC_TMDB_TOKEN;
    else process.env.EXPO_PUBLIC_TMDB_TOKEN = original;
  }
});
