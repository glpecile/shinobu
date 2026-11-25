import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useRef,
} from 'react';
import { Text, View, type ViewInstance } from 'react-native';
import {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedView } from '@/components/animated-view';
import {
  FLOATING_BACK_BUTTON_GAP,
  FLOATING_BACK_BUTTON_SIZE,
  useFloatingBackButtonTop,
} from '@/components/floating-back-button';
import { DURATION, KEYFRAME_EASE_EXIT, KEYFRAME_EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/cn';

interface AnchorFrame {
  y: number;
  height: number;
}

interface ScrolledTitleContextValue {
  anchorRef: RefObject<ViewInstance | null>;
  scrollY: SharedValue<number>;
  anchor: SharedValue<AnchorFrame>;
  measure: () => void;
}

const ScrolledTitleContext = createContext<ScrolledTitleContextValue | null>(null);

function useScrolledTitleContext(caller: string): ScrolledTitleContextValue {
  const context = useContext(ScrolledTitleContext);
  if (context == null) throw new Error(`${caller} must render inside <ScrolledTitle>`);
  return context;
}

function covered(
  scrollY: number,
  anchor: AnchorFrame,
  whole: boolean,
  barHeight: number,
): boolean {
  'worklet';
  const edge = whole ? anchor.y + anchor.height : anchor.y;
  return anchor.height > 0 && scrollY > edge - barHeight;
}

export function ScrolledTitle({ children }: { children: ReactNode }) {
  const frameRef = useRef<ViewInstance>(null);
  const anchorRef = useRef<ViewInstance>(null);
  const scrollY = useSharedValue(0);
  const anchor = useSharedValue<AnchorFrame>({ y: 0, height: 0 });

  function measure() {
    const frame = frameRef.current;
    if (frame == null) return;
    anchorRef.current?.measureLayout(frame, (_x, y, _width, height) => {
      // A screen parked under a pushed one lays out at zero (web hides it with
      // `display: none`); keep the real frame so the bar doesn't exit and re-enter.
      if (height === 0) return;
      anchor.set({ y: y + scrollY.get(), height });
    });
  }

  // Re-measure on scroll start: `onLayout` misses shifts caused by ancestor layout changes.
  useAnimatedReaction(
    () => scrollY.get() > 0,
    (scrolled, wasScrolled) => {
      if (scrolled && wasScrolled === false) scheduleOnRN(measure);
    },
  );

  return (
    <ScrolledTitleContext.Provider
      value={{ anchorRef, scrollY, anchor, measure }}
    >
      <View className="flex-1 bg-background" ref={frameRef}>
        {children}
      </View>
    </ScrolledTitleContext.Provider>
  );
}

export function useScrolledTitle() {
  const { scrollY } = useScrolledTitleContext('useScrolledTitle');
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });
  return { scrollY, onScroll, scrollEventThrottle: 16 as const };
}

function Anchor({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { anchorRef, measure } = useScrolledTitleContext('ScrolledTitle.Anchor');
  return (
    <View className={className} onLayout={measure} ref={anchorRef}>
      {children}
    </View>
  );
}

function useCovered(
  whole: boolean,
  duration: number,
  barHeight: number,
): SharedValue<number> {
  const { scrollY, anchor } = useScrolledTitleContext('ScrolledTitle.Bar');
  const progress = useSharedValue(0);
  useAnimatedReaction(
    () => covered(scrollY.get(), anchor.get(), whole, barHeight),
    (isCovered, wasCovered) => {
      if (isCovered === wasCovered) return;
      progress.set(withTiming(
        isCovered ? 1 : 0,
        isCovered
          ? { duration, easing: KEYFRAME_EASE_OUT }
          : { duration: DURATION.exit, easing: KEYFRAME_EASE_EXIT },
      ));
    },
  );
  return progress;
}

function Bar({ title, trailingAction = false }: { title: string; trailingAction?: boolean }) {
  const reduceMotion = useReducedMotion();
  const rowTop = useFloatingBackButtonTop();
  const barHeight = rowTop + FLOATING_BACK_BUTTON_SIZE + FLOATING_BACK_BUTTON_GAP;
  const shown = useCovered(false, DURATION.enter, barHeight);
  const risen = useCovered(true, DURATION.toggle, barHeight);
  const barStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const titleStyle = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: risen.get() }
      : { transform: [{ translateY: (1 - risen.get()) * rowTop }] },
  );
  return (
    <AnimatedView
      aria-hidden
      className={cn('absolute top-0 left-0 right-0 justify-end pl-16 pr-6 bg-background border-b border-border overflow-hidden', trailingAction && 'pr-16')}
      style={[{ pointerEvents: 'none', height: barHeight, paddingBottom: FLOATING_BACK_BUTTON_GAP }, barStyle]}
    >
      <AnimatedView className="justify-center" style={[{ height: FLOATING_BACK_BUTTON_SIZE }, titleStyle]}>
        <Text className="font-display text-lg text-foreground" numberOfLines={1}>
          {title}
        </Text>
      </AnimatedView>
    </AnimatedView>
  );
}

ScrolledTitle.Anchor = Anchor;
ScrolledTitle.Bar = Bar;
