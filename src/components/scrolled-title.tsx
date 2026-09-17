import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useRef,
} from 'react';
import { Text, View } from 'react-native';
import {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedView } from '@/components/animated-view';
import { cn } from '@/lib/cn';

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
  frameRef: RefObject<View | null>;
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

/** How much of the anchored title the bar covers: 0 until its top reaches the bar, 1 once it is under. */
function coverProgress(scrollY: number, anchor: AnchorFrame): number {
  'worklet';
  if (anchor.height === 0) return 0;
  const top = anchor.y - BAR_HEIGHT;
  return interpolate(scrollY, [top, top + anchor.height], [0, 1], Extrapolation.CLAMP);
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
 * As the scroll carries the anchored title under the bar, the bar fades in
 * over it and its own title slides up from under the bar's edge on the same
 * beat: the text is covered and rises again, small. Scroll-driven, so there
 * is no animation to reduce.
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
      value={{ frameRef, anchorRef, scrollY, anchor, measure }}
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
  // Solid well before the title is fully under, so the slide reads as the
  // covered text rising, not as two titles crossing on a see-through bar.
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      coverProgress(scrollY.value, anchor.value),
      [0, 0.35],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));
  const titleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - coverProgress(scrollY.value, anchor.value)) * ROW_TOP },
    ],
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
