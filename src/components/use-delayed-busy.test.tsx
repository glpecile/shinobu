import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, expect, jest, test } from 'bun:test';

GlobalRegistrator.register();
afterAll(() => {
  jest.useRealTimers();
  GlobalRegistrator.unregister();
});
const { act, renderHook } = await import('@testing-library/react');
const { useDelayedBusy } = await import('./use-delayed-busy');

test('a fast pending never shows; a slow one shows after 150ms and holds 300ms', () => {
  jest.useFakeTimers();
  const { result, rerender } = renderHook(({ pending }) => useDelayedBusy(pending), {
    initialProps: { pending: true },
  });
  act(() => jest.advanceTimersByTime(149));
  rerender({ pending: false });
  act(() => jest.advanceTimersByTime(1_000));
  expect(result.current).toBe(false);

  rerender({ pending: true });
  act(() => jest.advanceTimersByTime(150));
  expect(result.current).toBe(true);
  act(() => jest.advanceTimersByTime(10));
  rerender({ pending: false });
  act(() => jest.advanceTimersByTime(289));
  expect(result.current).toBe(true);
  act(() => jest.advanceTimersByTime(1));
  expect(result.current).toBe(false);
});
