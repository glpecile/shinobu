import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, expect, mock, test } from 'bun:test';
import { useState, type PropsWithChildren } from 'react';

GlobalRegistrator.register();
afterAll(() => GlobalRegistrator.unregister());
const { act, render } = await import('@testing-library/react');

let pan: { onUpdate: (event: { changeY: number }) => void; onFinalize: (event: { canceled: boolean }) => void };
let doubleTap: () => void;
function View({ children }: PropsWithChildren) { return <div>{children}</div>; }
function shared(initial: number) {
  let value = initial;
  return { get: () => value, set: (next: number) => { value = next; } };
}
mock.module('react-native', () => ({ View }));
mock.module('react-native-gesture-handler', () => ({
  GestureDetector: View,
  usePanGesture: (config: typeof pan) => { pan = config; return config; },
}));
mock.module('react-native-reanimated', () => ({
  useSharedValue: (initial: number) => useState(() => shared(initial))[0],
  useDerivedValue: (get: () => number) => ({ get }),
  useAnimatedStyle: () => ({}),
  withTiming: (value: number) => value,
  scrollTo: () => {},
}));
mock.module('react-native-worklets', () => ({ scheduleOnRN: (fn: () => void) => fn() }));
mock.module('@/components/animated-view', () => ({ AnimatedView: View }));
mock.module('@/lib/navigation/tab-double-tap', () => ({
  useTabDoubleTap: (_tab: string, callback: () => void) => { doubleTap = callback; },
}));
mock.module('@/lib/motion', () => ({ DURATION: { toggle: 200 }, TIMING_EASE_IN_OUT: () => {} }));
mock.module('./pull-scroll', () => ({ usePullScroll: () => ({ offset: shared(0), scrollRef: {} }) }));
mock.module('./refresh-mark', () => ({
  MARK_BOX: 48,
  PULL_TRIGGER: 72,
  RefreshMark: ({ refreshing }: { refreshing: boolean }) => <span role="status">{refreshing ? 'Refreshing' : 'Idle'}</span>,
}));
const { RefreshControl } = await import('./index.android');

test('cancelled and short pulls do not refresh; a released pull refreshes once until it settles', async () => {
  const pending = Promise.withResolvers<void>();
  const onRefresh = mock(() => pending.promise);
  const view = render(<RefreshControl onRefresh={onRefresh} tab="index" />);
  try {
    act(() => {
      pan.onUpdate({ changeY: 200 });
      pan.onFinalize({ canceled: true });
    });
    expect(onRefresh).toHaveBeenCalledTimes(0);
    act(() => {
      pan.onUpdate({ changeY: 20 });
      pan.onFinalize({ canceled: false });
    });
    expect(onRefresh).toHaveBeenCalledTimes(0);
    act(() => {
      pan.onUpdate({ changeY: 200 });
      pan.onFinalize({ canceled: false });
    });
    expect(view.getByRole('status').textContent).toBe('Refreshing');
    act(() => doubleTap());
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(); });
    expect(view.getByRole('status').textContent).toBe('Idle');
  } finally {
    await act(async () => { pending.resolve(); });
    view.unmount();
  }
});
