import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, expect, mock, test } from 'bun:test';
import { useState, type PropsWithChildren } from 'react';

GlobalRegistrator.register();
afterAll(() => GlobalRegistrator.unregister());
const { act, render } = await import('@testing-library/react');

let pan: {
  onTouchesDown: (event: { handlerTag: number }) => void;
  onUpdate: (event: { changeY: number; velocityY: number }) => void;
  onFinalize: (event: { canceled: boolean }) => void;
  activeOffsetY: number;
  failOffsetX: number[];
  failOffsetY: number;
};
let doubleTap: () => void;
const offset = shared(0);
const withTiming = mock((value: number) => value);
const failGesture = mock((_tag: number) => {});
function View({ children }: PropsWithChildren) { return <div>{children}</div>; }
function shared(initial: number) {
  let value = initial;
  return { get: () => value, set: (next: number) => { value = next; } };
}
mock.module('react-native', () => ({ View }));
mock.module('react-native-gesture-handler', () => ({
  GestureDetector: View,
  GestureStateManager: { fail: failGesture },
  usePanGesture: (config: typeof pan) => { pan = config; return config; },
}));
mock.module('react-native-reanimated', () => ({
  useSharedValue: (initial: number) => useState(() => shared(initial))[0],
  useDerivedValue: (get: () => number) => ({ get }),
  useAnimatedStyle: () => ({}),
  useAnimatedReaction: () => {},
  withSpring: (value: number) => value,
  withTiming,
  scrollTo: () => {},
}));
mock.module('@/lib/haptics', () => ({ haptics: { selection: () => {} } }));
mock.module('react-native-worklets', () => ({ scheduleOnRN: (fn: () => void) => fn() }));
mock.module('@/components/animated-view', () => ({ AnimatedView: View }));
mock.module('@/lib/navigation/tab-double-tap', () => ({
  useTabDoubleTap: (_tab: string, callback: () => void) => { doubleTap = callback; },
}));
mock.module('@/lib/motion', () => ({ DURATION: { toggle: 200 }, TIMING_EASE_IN_OUT: () => {} }));
mock.module('./pull-scroll', () => ({ usePullScroll: () => ({ offset, scrollRef: {} }) }));
mock.module('./refresh-mark', () => ({
  MARK_BOX: 48,
  PULL_TRIGGER: 72,
  RefreshMark: ({ refreshing }: { refreshing: boolean }) => <span role="status">{refreshing ? 'Refreshing' : 'Idle'}</span>,
}));
const { RefreshControl } = await import('./index.android');

test('only downward pulls at the top compete with scrolling', () => {
  const view = render(<RefreshControl onRefresh={async () => {}} />);
  try {
    expect(pan.activeOffsetY).toBeGreaterThan(0);
    expect(pan.failOffsetY).toBeLessThan(0);
    expect(pan.failOffsetX[0]).toBeLessThan(0);
    expect(pan.failOffsetX[1]).toBeGreaterThan(0);
    offset.set(10);
    act(() => pan.onTouchesDown({ handlerTag: 1 }));
    expect(failGesture).toHaveBeenCalledWith(1);
    failGesture.mockClear();
    offset.set(0);
    act(() => pan.onTouchesDown({ handlerTag: 2 }));
    expect(failGesture).not.toHaveBeenCalled();
  } finally {
    offset.set(0);
    view.unmount();
  }
});

test('cancelled and short pulls do not refresh; a released pull refreshes once until it settles', async () => {
  const pending = Promise.withResolvers<void>();
  const onRefresh = mock(() => pending.promise);
  const view = render(<RefreshControl onRefresh={onRefresh} tab="index" />);
  try {
    act(() => {
      pan.onUpdate({ changeY: 200, velocityY: 0 });
      pan.onFinalize({ canceled: true });
    });
    expect(onRefresh).toHaveBeenCalledTimes(0);
    act(() => {
      pan.onUpdate({ changeY: 20, velocityY: 0 });
      pan.onFinalize({ canceled: false });
    });
    expect(onRefresh).toHaveBeenCalledTimes(0);
    act(() => {
      pan.onUpdate({ changeY: 200, velocityY: 0 });
      pan.onFinalize({ canceled: false });
    });
    expect(view.getByRole('status').textContent).toBe('Refreshing');
    act(() => pan.onTouchesDown({ handlerTag: 3 }));
    expect(failGesture).toHaveBeenCalledWith(3);
    act(() => doubleTap());
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(); });
    expect(view.getByRole('status').textContent).toBe('Idle');
  } finally {
    await act(async () => { pending.resolve(); });
    view.unmount();
  }
});

test('an active pull cannot start another refresh after a tab double-tap', async () => {
  const pending = Promise.withResolvers<void>();
  const onRefresh = mock(() => pending.promise);
  const view = render(<RefreshControl onRefresh={onRefresh} tab="index" />);
  try {
    act(() => pan.onUpdate({ changeY: 200, velocityY: 0 }));
    // The hold animation is still above the trigger when the finger lifts.
    withTiming.mockImplementationOnce(() => 100);
    act(() => doubleTap());
    act(() => pan.onFinalize({ canceled: false }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => { pending.resolve(); });
    view.unmount();
  }
});
