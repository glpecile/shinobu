import { afterAll, expect, mock, test } from 'bun:test';

const dispatched: string[] = [];
const router = {
  prefetch: (href: string) => { dispatched.push(`preload ${href}`); },
  push: (href: string) => { dispatched.push(`push ${href}`); },
};
mock.module('expo-router', () => ({ router, useRouter: () => router }));

const previousOS = process.env.EXPO_OS;
process.env.EXPO_OS = 'ios';
afterAll(() => {
  if (previousOS == null) delete process.env.EXPO_OS;
  else process.env.EXPO_OS = previousOS;
});

const { usePreloadRoute, usePushRoute } = await import('./index');

test('opening a show after an episode replaces an earlier hidden detail before pushing', () => {
  const preload = usePreloadRoute();
  preload('/details/tmdb/1');
  preload('/episode/tmdb/2/1/1');

  expect(usePushRoute()('/details/tmdb/2')).toBe(true);
  expect(dispatched.slice(-2)).toEqual([
    'preload /details/tmdb/2',
    'push /details/tmdb/2',
  ]);
});
