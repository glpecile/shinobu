import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useRef,
} from 'react';
import { Text, View } from 'react-native';
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
import { cn } from '@/lib/cn';
import { DURATION, KEYFRAME_EASE_EXIT, KEYFRAME_EASE_OUT } from '@/lib/motion';

/** `top-12` + the 40px `FloatingBackButton` + 8: the bar's title row centres on that button. */
const BAR_HEIGHT = 96;
/** The title row's top, `top-12`: slid this far down, the row is fully under the bar's edge. */
const ROW_TOP = 48;

/** Where the anchored title sits in the scroll content; zero until measured. */
interface AnchorFrame {
  y: number;
  height: number;
}

interface ScrolledTitleContextValue {
  anchorRef: RefObject<View | null>;
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

/** Whether the bar has started to cover the anchored title. */
function covered(scrollY: number, anchor: AnchorFrame): boolean {
  'worklet';
  return anchor.height > 0 && scrollY > anchor.y - BAR_HEIGHT;
}

/**
 * A page title that scrolls away and comes back as a top bar, in three parts:
 *
 *   <ScrolledTitle className="bg-background">      the screen's frame
 *     <ScrollView {...useScrolledTitle()}>           or a JS onScroll writing scrollY
 *       <ScrolledTitle.Anchor><CopyTitle … /></…>    the title in the content
 *     </ScrollView>
 *     <ScrolledTitle.Bar title="…" />                 above the content …
 *     <FloatingBackButton … />                        … and under the button
 *   </ScrolledTitle>
 *
 * The moment the scroll carries the anchored title under the bar, the bar
 * fades in over it and its own title slides up from under the bar's edge:
 * the text is covered and rises again, small. Timed from that crossing
 * rather than tied to the offset, so a fast wheel tick that skips the whole
 * overlap still gets a full slide.
 */
export function ScrolledTitle({
  children,
  className,
}: {
  children: ReactNode;
  /** Layout only. */
  className?: string;
}) {
  const frameRef = useRef<View>(null);
  const anchorRef = useRef<View>(null);
  const scrollY = useSharedValue(0);
  const anchor = useSharedValue<AnchorFrame>({ y: 0, height: 0 });

  function measure() {
    const frame = frameRef.current;
    if (frame == null) return;
    anchorRef.current?.measureLayout(frame, (_x, y, _width, height) => {
      // A screen parked under a pushed one lays out at zero (web hides it with
      // `display: none`); keep the real frame so the bar doesn't exit and re-enter.
      if (height === 0) return;
      anchor.value = { y: y + scrollY.value, height };
    });
  }

  // The anchor's own `onLayout` misses the hero moving as a whole (a meta
  // line landing under a bottom-aligned title lifts it), so each scroll that
  // leaves the top measures again, well before the title nears the bar.
  useAnimatedReaction(
    () => scrollY.value > 0,
    (scrolled, wasScrolled) => {
      if (scrolled && wasScrolled === false) scheduleOnRN(measure);
    },
  );

  return (
    <ScrolledTitleContext.Provider
      value={{ anchorRef, scrollY, anchor, measure }}
    >
      <View className={cn('flex-1', className)} ref={frameRef}>
        {children}
      </View>
    </ScrolledTitleContext.Provider>
  );
}

/**
 * The scroll surface's wiring: spread `onScroll` + `scrollEventThrottle` onto
 * a Reanimated scroll view, or write `scrollY` from a plain JS scroll handler.
 */
export function useScrolledTitle() {
  const { scrollY } = useScrolledTitleContext('useScrolledTitle');
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  return { scrollY, onScroll, scrollEventThrottle: 16 as const };
}

/** Wraps the in-content title the bar stands in for. */
function Anchor({
  children,
  className,
}: {
  children: ReactNode;
  /** Layout only. */
  className?: string;
}) {
  const { anchorRef, measure } = useScrolledTitleContext('ScrolledTitle.Anchor');
  return (
    <View className={className} onLayout={measure} ref={anchorRef}>
      {children}
    </View>
  );
}

/** The bar. Never interactive, so it must never catch a scroll's first touch. */
function Bar({ title }: { title: string }) {
  const { scrollY, anchor } = useScrolledTitleContext('ScrolledTitle.Bar');
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(0);
  useAnimatedReaction(
    () => covered(scrollY.value, anchor.value),
    (isCovered, wasCovered) => {
      if (isCovered === wasCovered) return;
      const target = isCovered ? 1 : 0;
      shown.value = reduceMotion
        ? target
        : withTiming(
            target,
            isCovered
              ? { duration: DURATION.toggle, easing: KEYFRAME_EASE_OUT }
              : { duration: DURATION.exit, easing: KEYFRAME_EASE_EXIT },
          );
    },
  );
  const barStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  const titleStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - shown.value) * ROW_TOP }],
  }));
  return (
    <AnimatedView
      className="absolute top-0 left-0 right-0 h-24 justify-end pb-2 pl-16 pr-6 bg-background border-b border-border overflow-hidden"
      style={[{ pointerEvents: 'none' }, barStyle]}
    >
      <AnimatedView className="h-10 justify-center" style={titleStyle}>
        <Text className="font-display text-lg text-foreground" numberOfLines={1}>
          {title}
        </Text>
      </AnimatedView>
    </AnimatedView>
  );
}

ScrolledTitle.Anchor = Anchor;
ScrolledTitle.Bar = Bar;
