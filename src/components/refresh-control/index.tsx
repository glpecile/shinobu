import { type ComponentProps, useTransition } from 'react';
import { RefreshControl as GestureRefreshControl } from 'react-native-gesture-handler';
import { useAnimatedStyle, useDerivedValue } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { useTabDoubleTap } from '@/lib/navigation/tab-double-tap';

import { usePullScroll } from './pull-scroll';
import { MARK_BOX, RefreshMark } from './refresh-mark';

type RefreshControlProps = Omit<ComponentProps<typeof GestureRefreshControl>, 'onRefresh' | 'refreshing'> & {
  onRefresh: () => Promise<unknown>;
  /** Double-tapping this tab runs the same refresh, mark included. */
  tab?: string;
};

/** Uses gesture-handler's `UIRefreshControl` with a transparent tint on iOS for native trigger/hold while drawing `RefreshMark`. */
export function RefreshControl({ onRefresh, tab, ...rest }: RefreshControlProps) {
  const { offset } = usePullScroll();
  const [refreshing, startRefresh] = useTransition();
  const gap = useDerivedValue(() => Math.max(0, -offset.get()));
  const position = useAnimatedStyle(() => ({
    transform: [{ translateY: -gap.get() / 2 - MARK_BOX / 2 }],
  }));

  function refresh() {
    // Swallowed here: a rejected async transition would reach the error boundary.
    startRefresh(async () => {
      await onRefresh().catch(() => undefined);
    });
  }
  useTabDoubleTap(tab, refresh);

  return (
    <>
      <GestureRefreshControl {...rest} onRefresh={refresh} refreshing={refreshing} tintColor="transparent" />
      <AnimatedView
        className="pointer-events-none absolute inset-x-0 top-0 items-center justify-center"
        style={[{ height: MARK_BOX }, position]}
      >
        <RefreshMark gap={gap} refreshing={refreshing} />
      </AnimatedView>
    </>
  );
}
