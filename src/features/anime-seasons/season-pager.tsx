import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, View, type LayoutChangeEvent, type ScrollView } from 'react-native';
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
import { ANIME_SEASONS, type AnimeSeason } from '@/lib/providers/anilist/season';

/**
 * The four cours of a year as horizontal pages: a swipe moves to the
 * neighbouring cour, a tab tap scrolls there. A plain paging scroll view — a
 * native UIScrollView / HorizontalScrollView, CSS scroll snap on web — so the
 * gesture is the platform's and no pager library is needed.
 *
 * This is what makes a season switch smooth on native: the selected cour and
 * its two neighbours stay mounted, so a swipe reveals a wall that already
 * exists instead of unmounting one Legend List and mounting another on the
 * gesture frame (docs/solutions/season-switch-jank-remount-and-blur-on-native.md).
 * Neighbours mount once the scroll has settled — the idle moment — never
 * mid-gesture. Farther pages stay empty: they are only ever glimpsed while a
 * tab tap scrolls past them, and they fill in as soon as they are selected.
 *
 * Controlled: `season` comes from the URL, `onSettle` reports where a swipe
 * landed, and `progress` is the offset as a continuous cour index, written on
 * the UI thread every scroll frame so the season strip's pill rides the
 * finger. Native reports a settle through the momentum-end event;
 * react-native-web never fires it (its ScrollView only emits `onScroll`), so
 * on web a short quiet period after the last scroll event stands in for it.
 * Every event resets that timer, so it only ever fires at rest: settling
 * from a sample taken *during* a tab tap's page scroll would read the page
 * being left and snap the URL straight back to it. Pages get explicit sizes
 * from the measured pager because a horizontal scroll view does not stretch
 * its children's height on every platform.
 *
 * A tab tap's scroll is the platform's on native (`scrollTo`, animated). On
 * web that would be the browser's smooth scroll, whose duration scales with
 * distance and is not ours to set — 550ms for one page, close to a second
 * for three, well past the 300ms where motion stops reading as feedback. So
 * on web the tap drives `scrollLeft` itself from a timing animation, at the
 * pill's own duration and curve so the two read as one move, with scroll
 * snap suspended for its duration: under `mandatory` snap the browser
 * re-snaps every mid-page write straight back to the page it started on.
 * Reanimated's `scrollTo` is a no-op on web, hence the DOM write.
 */

/** Quiet time after the last scroll event before a position counts as settled (web). */
const SETTLE_MS = 120;
/** How far off a page boundary a resting offset may sit (fractional zoom rounds `scrollLeft`). */
const BOUNDARY_TOLERANCE = 2;
const isWeb = Platform.OS === 'web';

export function SeasonPager({
  season,
  onSettle,
  progress,
  renderSeason,
}: {
  season: AnimeSeason;
  onSettle: (season: AnimeSeason) => void;
  progress: SharedValue<number>;
  renderSeason: (season: AnimeSeason) => ReactNode;
}) {
  const scroller = useRef<ScrollView>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // The page last scrolled into place. Null until the first layout, so the
  // initial position is a jump, not a slide in from the first cour.
  const shown = useRef<number | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();
  const index = ANIME_SEASONS.indexOf(season);
  // Web only: the offset a tab tap is animating towards, retargeted from
  // wherever the scroll is if the next tap lands mid-flight.
  const driven = useSharedValue(0);

  useEffect(() => () => clearTimeout(settleTimer.current ?? undefined), []);

  function scrollNode(): HTMLElement | null {
    return isWeb ? (scroller.current?.getScrollableNode() ?? null) : null;
  }

  function setScrollLeft(x: number) {
    const node = scrollNode();
    if (node) node.scrollLeft = x;
  }

  function restoreSnap() {
    const node = scrollNode();
    if (node) node.style.scrollSnapType = '';
  }

  useAnimatedReaction(
    () => driven.value,
    (x, previous) => {
      if (isWeb && previous != null && x !== previous) scheduleOnRN(setScrollLeft, x);
    },
  );

  useEffect(() => {
    if (size.width === 0) return;
    const animated = shown.current != null && shown.current !== index && !reduceMotion;
    shown.current = index;
    const x = index * size.width;
    // A jump fires no scroll frames on every platform; keep the pill honest.
    if (!animated) progress.value = index;
    const node = animated ? scrollNode() : null;
    if (node == null) {
      scroller.current?.scrollTo({ x, animated });
      return;
    }
    node.style.scrollSnapType = 'none';
    driven.value = node.scrollLeft;
    driven.value = withTiming(
      x,
      { duration: DURATION.toggle, easing: TIMING_EASE_IN_OUT },
      (finished) => {
        if (finished) scheduleOnRN(restoreSnap);
      },
    );
  }, [index, size.width, reduceMotion, progress, driven]);

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  }

  function settleAt(x: number) {
    if (size.width === 0) return;
    const page = Math.round(x / size.width);
    if (Math.abs(x - page * size.width) > BOUNDARY_TOLERANCE) return;
    const settled = ANIME_SEASONS[page];
    if (settled == null || settled === season) return;
    haptics.selection();
    onSettle(settled);
  }

  function scheduleSettle(x: number) {
    clearTimeout(settleTimer.current ?? undefined);
    settleTimer.current = setTimeout(() => settleAt(x), SETTLE_MS);
  }

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      if (size.width === 0) return;
      progress.value = event.contentOffset.x / size.width;
      if (isWeb) scheduleOnRN(scheduleSettle, event.contentOffset.x);
    },
    onMomentumEnd: (event) => {
      scheduleOnRN(settleAt, event.contentOffset.x);
    },
  });

  return (
    <AnimatedScrollView
      className="flex-1"
      horizontal
      onLayout={onLayout}
      onScroll={onScroll}
      pagingEnabled
      ref={scroller}
      scrollEventThrottle={16}
      showsHorizontalScrollIndicator={false}
    >
      {size.width > 0 &&
        ANIME_SEASONS.map((cour, i) => (
          <View key={cour} style={{ width: size.width, height: size.height }}>
            {Math.abs(i - index) <= 1 ? renderSeason(cour) : null}
          </View>
        ))}
    </AnimatedScrollView>
  );
}
