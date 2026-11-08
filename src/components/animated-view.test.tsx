import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, expect, mock, test } from 'bun:test';
import { useState, type PropsWithChildren } from 'react';

GlobalRegistrator.register();
const platform = process.env.EXPO_OS;
afterAll(() => {
  process.env.EXPO_OS = platform;
  GlobalRegistrator.unregister();
});
const { act, render } = await import('@testing-library/react');

let scrollProps: {
  refreshControl?: React.ReactNode;
  onGestureUpdate_CAN_CAUSE_INFINITE_RERENDER?: (gesture: { handlerTag: number }) => void;
};
function View({ children }: PropsWithChildren) { return <div>{children}</div>; }
function ScrollView(props: PropsWithChildren<typeof scrollProps>) {
  scrollProps = props;
  return <div data-testid="native-scroll">{props.refreshControl}{props.children}</div>;
}
mock.module('react-native', () => ({ TextInput: View }));
mock.module('react-native-gesture-handler', () => ({ ScrollView }));
mock.module('react-native-reanimated', () => ({
  default: { View, Text: View, ScrollView, createAnimatedComponent: (component: unknown) => component },
  useAnimatedRef: () => useState(() => () => {})[0],
  useScrollOffset: () => ({ get: () => 0 }),
}));
mock.module('@/lib/with-uniwind', () => ({ withUniwind: (component: unknown) => component }));
const { usePullScroll } = await import('@/components/refresh-control/pull-scroll');
const { GestureScrollView } = await import('./animated-view');

function Refresh({ children }: PropsWithChildren) {
  const { scrollGesture } = usePullScroll();
  return <section data-testid="refresh" data-gesture={scrollGesture?.handlerTag}>{children}</section>;
}

test('Android puts the refresh gesture outside the native scroll gesture', () => {
  process.env.EXPO_OS = 'android';
  const view = render(<GestureScrollView refreshControl={<Refresh />}><span>Content</span></GestureScrollView>);
  try {
    expect(view.getByTestId('refresh').contains(view.getByTestId('native-scroll'))).toBe(true);
    expect(scrollProps.refreshControl).toBeUndefined();
    act(() => scrollProps.onGestureUpdate_CAN_CAUSE_INFINITE_RERENDER?.({ handlerTag: 42 }));
    expect(view.getByTestId('refresh').getAttribute('data-gesture')).toBe('42');
  } finally {
    view.unmount();
  }
});

test('iOS keeps the native refresh control inside the scroll view', () => {
  process.env.EXPO_OS = 'ios';
  const view = render(<GestureScrollView refreshControl={<Refresh />}><span>Content</span></GestureScrollView>);
  try {
    expect(view.getByTestId('native-scroll').contains(view.getByTestId('refresh'))).toBe(true);
    expect(scrollProps.refreshControl).toBeDefined();
  } finally {
    view.unmount();
  }
});
