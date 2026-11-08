import { type ComponentProps, type ReactNode, useTransition } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import {
  GestureDetector,
  type RefreshControl as GestureRefreshControl,
  type NativeGesture,
  usePanGesture,
} from 'react-native-gesture-handler';
import { scrollTo, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedView } from '@/components/animated-view';
import { useTabDoubleTap } from '@/lib/navigation/tab-double-tap';
import { DURATION, TIMING_EASE_IN_OUT } from '@/lib/motion';

import { usePullScroll } from './pull-scroll';
import { MARK_BOX, PULL_TRIGGER, RefreshMark } from './refresh-mark';

type RefreshControlProps = Omit<ComponentProps<typeof GestureRefreshControl>, 'onRefresh' | 'refreshing'> & {
  onRefresh: () => Promise<unknown>;
  tab?: string;
};

/** Where the content rests while the refresh runs. */
const HOLD = 64;
/** The content trails the finger, X-style. */
const FRICTION = 0.5;
const settle = { duration: DURATION.toggle, easing: TIMING_EASE_IN_OUT };

/**
 * Android has no top overscroll, so this replaces SwipeRefreshLayout: RN's
 * ScrollView wraps itself in its `refreshControl` here and passes the outer
 * `style`, and gesture-handler's passes its scroll gesture as `block`. A pan
 * beside that gesture slides the scroll view down from the top and opens a
 * gap for the 忍 mark.
 */
export function RefreshControl({
  onRefresh,
  tab,
  progressViewOffset = 0,
  ...native
}: RefreshControlProps) {
  // Props RN and gesture-handler add when they render this element.
  const { children, style, block } = native as { children?: ReactNode; style?: StyleProp<ViewStyle>; block?: NativeGesture };
  const { offset, scrollRef } = usePullScroll();
  const [refreshing, startRefresh] = useTransition();
  const pull = useSharedValue(0);
  const dragged = useSharedValue(0);
  // A screen drawn under the status bar opens the gap below it.
  const gap = useDerivedValue(() => Math.max(0, pull.get() - progressViewOffset));
  const content = useAnimatedStyle(() => ({ transform: [{ translateY: pull.get() }] }));
  const position = useAnimatedStyle(() => ({
    transform: [{ translateY: progressViewOffset + (gap.get() - MARK_BOX) / 2 }],
  }));

  function refresh() {
    if (refreshing) return;
    pull.set(withTiming(HOLD + progressViewOffset, settle));
    startRefresh(async () => {
      await onRefresh().catch(() => undefined);
      pull.set(withTiming(0, settle));
    });
  }
  useTabDoubleTap(tab, refresh);

  const pan = usePanGesture({
    simultaneousWith: block,
    activeOffsetY: [-8, 8],
    failOffsetX: [-16, 16],
    onUpdate: (event) => {
      if (refreshing) return;
      // Only a drag that starts pulling at the top, or is already pulling.
      if (dragged.get() === 0 && (offset.get() > 0 || event.changeY <= 0)) return;
      dragged.set(Math.max(0, dragged.get() + event.changeY));
      pull.set(dragged.get() * FRICTION);
      // The list would scroll up under a finger pushing the pull back.
      scrollTo(scrollRef, 0, 0, false);
    },
    onFinalize: (event) => {
      if (dragged.get() === 0) return;
      dragged.set(0);
      if (!event.canceled && gap.get() >= PULL_TRIGGER) scheduleOnRN(refresh);
      else pull.set(withTiming(0, settle));
    },
  });

  return (
    <GestureDetector gesture={pan}>
      <View style={[style, { overflow: 'hidden' }]}>
        <AnimatedView
          className="pointer-events-none absolute inset-x-0 top-0 items-center justify-center"
          style={[{ height: MARK_BOX }, position]}
        >
          <RefreshMark gap={gap} refreshing={refreshing} />
        </AnimatedView>
        <AnimatedView className="flex-1" style={content}>
          {children}
        </AnimatedView>
      </View>
    </GestureDetector>
  );
}
