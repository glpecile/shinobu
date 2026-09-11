import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

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
 * landed. Native reports that through `onMomentumScrollEnd`; react-native-web
 * never fires it (its ScrollView only emits `onScroll`, with one trailing
 * event once scrolling stops), so a short quiet period after the last scroll
 * event stands in for it there — but only when the offset sits on a page
 * boundary, so a finger held still mid-page never flips the season under
 * itself. Pages get explicit sizes from the measured pager because a
 * horizontal scroll view does not stretch its children's height on every
 * platform.
 */

/** Quiet time after the last scroll event before a position counts as settled. */
const SETTLE_MS = 120;
export function SeasonPager({
  season,
  onSettle,
  renderSeason,
}: {
  season: AnimeSeason;
  onSettle: (season: AnimeSeason) => void;
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
    scroller.current?.scrollTo({ x: index * size.width, animated });
  }, [index, size.width, reduceMotion]);

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  }

  function settleAt(x: number) {
    if (size.width === 0) return;
    const page = Math.round(x / size.width);
    if (Math.abs(x - page * size.width) > 1) return;
    const settled = ANIME_SEASONS[page];
    if (settled == null || settled === season) return;
    haptics.selection();
    onSettle(settled);
  }

  function onMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    settleAt(event.nativeEvent.contentOffset.x);
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { x } = event.nativeEvent.contentOffset;
    clearTimeout(settleTimer.current ?? undefined);
    settleTimer.current = setTimeout(() => settleAt(x), SETTLE_MS);
  }

  return (
    <ScrollView
      className="flex-1"
      horizontal
      onLayout={onLayout}
      onMomentumScrollEnd={onMomentumScrollEnd}
      // Web only: native has the real momentum end, and a JS scroll handler
      // there would only add bridge traffic on the gesture frames.
      onScroll={Platform.OS === 'web' ? onScroll : undefined}
      pagingEnabled
      ref={scroller}
      scrollEventThrottle={SETTLE_MS}
      showsHorizontalScrollIndicator={false}
    >
      {size.width > 0 &&
        ANIME_SEASONS.map((cour, i) => (
          <View key={cour} style={{ width: size.width, height: size.height }}>
            {Math.abs(i - index) <= 1 ? renderSeason(cour) : null}
          </View>
        ))}
    </ScrollView>
  );
}
