import { afterAll, expect, mock, test } from 'bun:test';

const dispatched: string[] = [];
const router = {
  prefetch: (href: string) => { dispatched.push(`preload ${href}`); },
  push: (href: string) => { dispatched.push(`push ${href}`); },
};
let focused = true;
const navigation = { isFocused: () => focused };
mock.module('expo-router', () => ({
  router,
  useNavigation: () => navigation,
  useRouter: () => router,
}));

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

test('a tap queued behind a slow push neither preloads nor pushes from the covered screen', () => {
  focused = false;
  const before = dispatched.length;

  usePreloadRoute()('/details/tmdb/3');
  expect(usePushRoute()('/details/tmdb/3')).toBe(false);
  expect(dispatched.length).toBe(before);
  focused = true;
});
