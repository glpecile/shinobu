import { ScrollView, View, useWindowDimensions } from 'react-native';

import { Skeleton, staggerDelay } from '@/components/skeleton';
import { cn } from '@/lib/cn';

// Must stay in sync with MediaCard (w-40 = 160) and the mr-3 gap (12).
const CARD_WIDTH = 160;
const CARD_GAP = 12;

/** One block: `MediaCard` paints its title over the artwork, not below it. */
function SkeletonCard({ index }: { index: number }) {
  return (
    <Skeleton
      className="w-40 h-60 rounded-card mr-3"
      delay={staggerDelay(index)}
    />
  );
}

function SkeletonRow({ cardCount }: { cardCount: number }) {
  return (
    <View className="mb-6">
      <SkeletonSectionHeader widthClass="w-40" />
      <ScrollView
        horizontal
        className="px-4"
        showsHorizontalScrollIndicator={false}
      >
        {Array.from({ length: cardCount }).map((_, index) => (
          <SkeletonCard index={index} key={index} />
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

/** Art plus two text lines below it, unlike the poster cards. */
function SkeletonLandscapeCard({ index }: { index: number }) {
  const delay = staggerDelay(index);
  return (
    <View className="w-64 mr-3">
      <Skeleton className="w-full h-36 rounded-card" delay={delay} />
      <Skeleton className="h-4 w-2/3 rounded mt-2" delay={delay} />
      <Skeleton className="h-3 w-1/2 rounded mt-1.5" delay={delay} />
    </View>
  );
}

// Must equal the day-content area's reserved height in `up-next-section.tsx`
// (DAY_CONTENT_MIN_HEIGHT). The real section locks this height whether the
// selected day holds cards or the centered empty state, so the skeleton
// reserves the same box — otherwise the row still jumps when it resolves.
const DAY_CONTENT_MIN_HEIGHT = 188;

function SkeletonDayCell({ index }: { index: number }) {
  // Mirrors the real cell's internal stack (weekday · date · dot row) so the
  // strip is the same height here as once it resolves.
  const delay = staggerDelay(index);
  return (
    <View className="w-14 py-2 mr-2 items-center rounded-md border border-border/60 bg-surface">
      <Skeleton className="h-4 w-7 rounded" delay={delay} />
      <Skeleton className="h-6 w-6 rounded mt-0.5" delay={delay} />
      <View className="h-1.5 mt-1" />
    </View>
  );
}

function SkeletonSectionHeader({ widthClass }: { widthClass: string }) {
  // text-xl title height (no eyebrow — the real header dropped it), mb-3 gap.
  return <Skeleton className={cn('h-7', widthClass, 'rounded mb-3 mx-4')} />;
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
            <SkeletonLandscapeCard index={index} key={index} />
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
            <SkeletonDayCell index={index} key={index} />
          ))}
        </ScrollView>
        {/* The content area below the strip — a landscape card row, mirroring a
            selected day that holds upcoming episodes. Same height as the
            reserved box either way (card height ≈ DAY_CONTENT_MIN_HEIGHT), so a
            day that resolves empty still doesn't shift the feed. */}
        <View className="mt-3" style={{ minHeight: DAY_CONTENT_MIN_HEIGHT }}>
          <ScrollView
            horizontal
            className="px-4"
            showsHorizontalScrollIndicator={false}
          >
            {Array.from({ length: cardCount }).map((_, index) => (
              <SkeletonLandscapeCard index={index} key={index} />
            ))}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

/**
 * Whole-feed placeholder, shown while an OAuth connect is exchanging (the
 * feed itself loads row-by-row via per-row suspense boundaries). Mirrors the
 * real feed with two rows of skeleton cards.
 */
export function FeedSkeleton() {
  return (
    <View className="pt-2">
      <FeedRowSkeleton />
      <FeedRowSkeleton />
    </View>
  );
}
