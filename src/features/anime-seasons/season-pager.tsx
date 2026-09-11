import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, View, type LayoutChangeEvent, type ScrollView } from 'react-native';
import {
  useAnimatedScrollHandler,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedScrollView } from '@/components/animated-view';
import { haptics } from '@/lib/haptics';
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

  useEffect(() => () => clearTimeout(settleTimer.current ?? undefined), []);

  useEffect(() => {
    if (size.width === 0) return;
    const animated = shown.current != null && shown.current !== index && !reduceMotion;
    shown.current = index;
    // A jump fires no scroll frames on every platform; keep the pill honest.
    if (!animated) progress.value = index;
    scroller.current?.scrollTo({ x: index * size.width, animated });
  }, [index, size.width, reduceMotion, progress]);

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
