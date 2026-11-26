import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
  type ViewStyle,
} from 'react-native';
import {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedScrollView } from '@/components/animated-view';
import { haptics } from '@/lib/haptics';
import { DURATION, TIMING_EASE_IN_OUT } from '@/lib/motion';

/*
 * Neighbour pages stay mounted to avoid remounting Legend List mid-swipe
 * (docs/solutions/season-switch-jank-remount-and-blur-on-native.md).
 * On web, react-native-web never fires `onMomentumEnd`, Reanimated `scrollTo` is a no-op,
 * and `mandatory` scroll-snap overrides mid-animation `scrollLeft` writes, so web drives
 * `scrollLeft` directly with scroll-snap suspended.
 */

/** How far off a page boundary a resting offset may sit (fractional zoom rounds `scrollLeft`). */
const BOUNDARY_TOLERANCE = 2;
const isWeb = Platform.OS === 'web';
/** Web pages by tap: `scrollLeft` still moves, a trackpad swipe reaches the browser. */
const webScrollLock = { overflowX: 'hidden' } as unknown as ViewStyle;
/** Avoids React's SSR `useLayoutEffect` warning during static web rendering. */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function Pager<T extends string>({
  value,
  options,
  onSettle,
  progress,
  renderPage,
}: {
  value: T;
  options: readonly T[];
  onSettle: (value: T) => void;
  progress: SharedValue<number>;
  renderPage: (value: T) => ReactNode;
}) {
  const scroller = useRef<ScrollViewInstance>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const shown = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();
  const index = options.indexOf(value);
  const [settled, setSettled] = useState(index);
  const driven = useSharedValue(0);

  function scrollNode(): HTMLElement | null {
    return isWeb
      ? ((scroller.current?.getScrollableNode() ?? null) as unknown as HTMLElement | null)
      : null;
  }

  function setScrollLeft(x: number) {
    const node = scrollNode();
    if (node) node.scrollLeft = x;
  }

  function finishWebTap(page: number) {
    const node = scrollNode();
    if (node) node.style.scrollSnapType = '';
    setSettled(page);
  }

  useAnimatedReaction(
    () => driven.get(),
    (x, previous) => {
      if (isWeb && previous != null && x !== previous) scheduleOnRN(setScrollLeft, x);
    },
  );

  useBeforePaint(() => {
    if (size.width === 0) return;
    const animated = shown.current != null && shown.current !== index && !reduceMotion;
    shown.current = index;
    const x = index * size.width;
    // A jump fires no scroll frames on every platform; keep the pill honest.
    if (!animated) {
      progress.set(index);
      setSettled(index);
    }
    const node = animated ? scrollNode() : null;
    if (node == null) {
      scroller.current?.scrollTo({ x, animated });
      return;
    }
    node.style.scrollSnapType = 'none';
    driven.set(node.scrollLeft);
    driven.set(
      withTiming(x, { duration: DURATION.toggle, easing: TIMING_EASE_IN_OUT }, (finished) => {
        if (finished) scheduleOnRN(finishWebTap, index);
      }),
    );
  }, [index, size.width, reduceMotion, progress, driven]);

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    // Covered stack screens on web use `display: none` and report zero layout; keep the last size so pages stay mounted.
    if (width === 0 || height === 0) return;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  }

  function settleAt(x: number) {
    if (size.width === 0) return;
    const page = Math.round(x / size.width);
    if (Math.abs(x - page * size.width) > BOUNDARY_TOLERANCE) return;
    const landed = options[page];
    if (landed == null) return;
    if (Math.abs(page - index) > 1) {
      scroller.current?.scrollTo({ x: index * size.width, animated: false });
      return;
    }
    setSettled(page);
    if (landed === value) return;
    haptics.selection();
    onSettle(landed);
  }

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      if (size.width === 0) return;
      progress.set(event.contentOffset.x / size.width);
    },
    onMomentumEnd: (event) => {
      scheduleOnRN(settleAt, event.contentOffset.x);
    },
  });

  return (
    <View className="flex-1" onLayout={onLayout}>
      {size.width > 0 && (
        <AnimatedScrollView
          className="flex-1"
          // Android drops `scrollTo` called before child layout; `contentOffset` applies once laid out
          // (docs/solutions/android-scrollview-drops-an-offset-set-before-layout.md).
          contentOffset={{ x: settled * size.width, y: 0 }}
          horizontal
          onScroll={onScroll}
          pagingEnabled
          ref={scroller}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          style={isWeb ? webScrollLock : undefined}
        >
          {options.map((page, i) => (
            <View
              accessibilityElementsHidden={i !== index}
              importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}
              key={page}
              style={{ width: size.width, height: size.height }}
            >
              {Math.abs(i - settled) <= 1 || i === index ? renderPage(page) : null}
            </View>
          ))}
        </AnimatedScrollView>
      )}
    </View>
  );
}
