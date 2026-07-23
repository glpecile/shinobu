import { ScrollView, View, useWindowDimensions } from 'react-native';

import { AnimatedView } from '@/components/animated-view';

// Must stay in sync with MediaCard (w-40 = 160) and the mr-3 gap (12).
const CARD_WIDTH = 160;
const CARD_GAP = 12;

// Reanimated CSS animation: declarative, runs on the UI thread, and cleans
// itself up on unmount — no useEffect/Animated.loop lifecycle to manage.
const shimmer = {
  '0%': { transform: [{ translateX: -CARD_WIDTH }] },
  '100%': { transform: [{ translateX: CARD_WIDTH }] },
};

function ShimmerCard() {
  return (
    <View className="w-40 h-60 rounded-card overflow-hidden border border-border/50 bg-surface mr-3 relative">
      <View className="w-full h-full bg-muted/20" />
      <View className="absolute bottom-0 left-0 right-0 h-28 bg-black/40" />
      <View className="absolute bottom-0 left-0 right-0 p-3">
        <View className="h-4 bg-muted/30 rounded w-full mb-2" />
        <View className="h-3 bg-muted/20 rounded w-2/3" />
      </View>
      <AnimatedView
        className="absolute top-0 bottom-0 w-20 bg-white/5"
        style={{
          animationName: shimmer,
          animationDuration: '1500ms',
          animationIterationCount: 'infinite',
          animationTimingFunction: 'ease-in-out',
        }}
      />
    </View>
  );
}

function SkeletonRow({ cardCount }: { cardCount: number }) {
  return (
    <View className="mb-6">
      <View className="h-7 w-40 bg-muted/20 rounded mb-3 mx-4" />
      <ScrollView
        horizontal
        className="px-4"
        showsHorizontalScrollIndicator={false}
      >
        {Array.from({ length: cardCount }).map((_, index) => (
          <ShimmerCard key={index} />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * Skeleton for a single feed row — the `SuspenseSection` fallback while that
 * row's query is in flight. Enough cards to fill the viewport edge to edge:
 * the real carousels overflow the window, so a fixed short card count would
 * leave trailing whitespace on wide (web) viewports and cause a visible
 * fill-in when content lands.
 */
export function FeedRowSkeleton() {
  const { width } = useWindowDimensions();
  // +1 so the last card is clipped by the edge, like a real carousel.
  const cardCount = Math.ceil(width / (CARD_WIDTH + CARD_GAP)) + 1;

  return <SkeletonRow cardCount={cardCount} />;
}

// Must stay in sync with the Up Next card (w-64 = 256, h-36 art = 144).
const LANDSCAPE_WIDTH = 256;

function ShimmerLandscapeCard() {
  return (
    <View className="w-64 mr-3">
      <View className="w-full h-36 rounded-card overflow-hidden border border-border/50 bg-surface relative">
        <View className="w-full h-full bg-muted/20" />
        <AnimatedView
          className="absolute top-0 bottom-0 w-24 bg-white/5"
          style={{
            animationName: shimmer,
            animationDuration: '1500ms',
            animationIterationCount: 'infinite',
            animationTimingFunction: 'ease-in-out',
          }}
        />
      </View>
      <View className="h-4 bg-muted/30 rounded w-2/3 mt-2" />
      <View className="h-3 bg-muted/20 rounded w-1/2 mt-1.5" />
    </View>
  );
}

// Must equal the day-content area's reserved height in `up-next-section.tsx`
// (DAY_CONTENT_MIN_HEIGHT). The real section locks this height whether the
// selected day holds cards or the centered empty state, so the skeleton
// reserves the same box — otherwise the row still jumps when it resolves.
const DAY_CONTENT_MIN_HEIGHT = 188;

function ShimmerDayCell() {
  // Mirrors the real cell's internal stack (weekday · date · dot row) so the
  // strip is the same height here as once it resolves.
  return (
    <View className="w-14 py-2 mr-2 items-center rounded-md border border-border/60 bg-surface">
      <View className="h-4 w-7 bg-muted/20 rounded" />
      <View className="h-6 w-6 bg-muted/30 rounded mt-0.5" />
      <View className="h-1.5 mt-1" />
    </View>
  );
}

function SkeletonSectionHeader({ widthClass }: { widthClass: string }) {
  // text-xl title height (no eyebrow — the real header dropped it), mb-3 gap.
  return <View className={`h-7 ${widthClass} bg-muted/20 rounded mb-3 mx-4`} />;
}

/**
 * Fallback for the whole Up Next block (plan 0019). It mirrors the *resolved*
 * layout — a Continue Watching landscape row **and** the "This week" header,
 * 7-day strip, and its fixed-height content area — because the section is the
 * heaviest home query and resolves last: a single-row skeleton would grow by
 * ~300px on resolve and shove every row beneath it down after the user is
 * already reading. Reserving both sub-sections' height keeps that from moving.
 *
 * (If a user has no Continue Watching, the real section omits that row and the
 * feed nudges *up* on resolve — the far rarer, far gentler case than the
 * downward jump this prevents for the common "has continue-watching" user.)
 */
export function UpNextSectionSkeleton() {
  const { width } = useWindowDimensions();
  const cardCount = Math.ceil(width / (LANDSCAPE_WIDTH + CARD_GAP)) + 1;
  const dayCount = 7;

  return (
    <View>
      {/* Continue Watching */}
      <View className="mb-6">
        <SkeletonSectionHeader widthClass="w-48" />
        <ScrollView
          horizontal
          className="px-4"
          showsHorizontalScrollIndicator={false}
        >
          {Array.from({ length: cardCount }).map((_, index) => (
            <ShimmerLandscapeCard key={index} />
          ))}
        </ScrollView>
      </View>

      {/* This week */}
      <View className="mb-6">
        <SkeletonSectionHeader widthClass="w-28" />
        <ScrollView
          horizontal
          className="px-4"
          showsHorizontalScrollIndicator={false}
        >
          {Array.from({ length: dayCount }).map((_, index) => (
            <ShimmerDayCell key={index} />
          ))}
        </ScrollView>
        {/* The content area below the strip — reserved, not filled: today
            (the default selection) is usually empty since its episodes have
            already aired into Continue Watching, so an empty box is the most
            faithful placeholder for the resolved state. */}
        <View className="mt-3" style={{ minHeight: DAY_CONTENT_MIN_HEIGHT }} />
      </View>
    </View>
  );
}

/**
 * Whole-feed placeholder, shown while an OAuth connect is exchanging (the
 * feed itself loads row-by-row via per-row suspense boundaries). Mirrors the
 * real feed with two rows of shimmer cards.
 */
export function FeedSkeleton() {
  return (
    <View className="pt-2">
      <FeedRowSkeleton />
      <FeedRowSkeleton />
    </View>
  );
}
