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

/**
 * Pull-to-refresh that draws the 忍 mark in the overscroll gap and holds it
 * until `onRefresh`'s promise settles. The pending state lives here, so a pull
 * re-renders the control, not the list it sits in.
 *
 * iOS keeps UIRefreshControl, with its spinner hidden, for the trigger and the
 * hold. It's gesture-handler's, so the pull waits on the scroll gesture.
 */
export function RefreshControl({ onRefresh, tab, ...rest }: RefreshControlProps) {
  const { offset } = usePullScroll();
  const [refreshing, startRefresh] = useTransition();
  const gap = useDerivedValue(() => Math.max(0, -offset.get()));
  // A child of the scroll view, so it sits in content coordinates: the centre
  // of the gap above the content's top edge.
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
