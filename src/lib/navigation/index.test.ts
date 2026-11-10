import { expect, mock, test } from 'bun:test';

const dispatched: string[] = [];
const router = {
  push: (href: string) => { dispatched.push(`push ${href}`); },
};
let focused = true;
const navigation = { isFocused: () => focused };
mock.module('expo-router', () => ({
  useNavigation: () => navigation,
  useRouter: () => router,
}));

const { usePushRoute } = await import('./index');

test('a tap queued behind a slow push does not push from the covered screen', () => {
  const push = usePushRoute();
  focused = false;
  const before = dispatched.length;

  expect(push('/details/tmdb/3')).toBe(false);
  expect(dispatched.length).toBe(before);
  focused = true;
});
