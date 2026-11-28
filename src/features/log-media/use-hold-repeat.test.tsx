import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, expect, jest, mock, test } from 'bun:test';

GlobalRegistrator.register();
afterAll(() => {
  jest.useRealTimers();
  GlobalRegistrator.unregister();
});
mock.module('@/lib/haptics', () => ({ haptics: { selection: () => {} } }));
const { act, renderHook } = await import('@testing-library/react');
const { useHoldRepeat } = await import('./use-hold-repeat');

test('a hold steps at once, at 400ms, then every 60ms, and stops at the bound', () => {
  jest.useFakeTimers();
  let value = 0;
  const { result, rerender } = renderHook(
    ({ max }) => useHoldRepeat(() => (value += 1), value < max),
    { initialProps: { max: 4 } },
  );
  act(() => result.current.onPressIn());
  expect(value).toBe(1);
  act(() => jest.advanceTimersByTime(399));
  expect(value).toBe(1);
  act(() => jest.advanceTimersByTime(1));
  rerender({ max: 4 });
  expect(value).toBe(2);
  act(() => jest.advanceTimersByTime(60));
  rerender({ max: 4 });
  act(() => jest.advanceTimersByTime(60));
  rerender({ max: 4 });
  expect(value).toBe(4);
  // Disabled at the bound, with no press-out: the repeat stops on its own.
  act(() => jest.advanceTimersByTime(1_000));
  expect(value).toBe(4);
});

test('release stops the repeat, and onPress steps only without a press-in', () => {
  jest.useFakeTimers();
  let value = 0;
  const { result } = renderHook(() => useHoldRepeat(() => (value += 1), true));
  act(() => result.current.onPressIn());
  act(() => result.current.onPressOut());
  act(() => result.current.onPress());
  act(() => jest.advanceTimersByTime(1_000));
  expect(value).toBe(1);
  act(() => result.current.onPress());
  expect(value).toBe(2);
});
