import { View, useWindowDimensions } from 'react-native';

import { Rail } from '@/components/rail';
import { CollapsibleSection } from '@/components/collapsible-section';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { cn } from '@/lib/cn';
import { episodeCardRailHeight, STACK_OFFSET } from '@/features/up-next/ui/metrics';

// Must stay in sync with MediaCard (w-40 = 160) and the mr-3 gap (12).
const CARD_WIDTH = 160;
const CARD_GAP = 12;

/** One block: `MediaCard` paints its title over the artwork, not below it. */
function SkeletonCard({ index }: { index: number }) {
  return (
    <Skeleton
      className="w-40 h-60 rounded-lg mr-3"
      delay={staggerDelay(index)}
    />
  );
}

function SkeletonRow({ cardCount, hasAction = false }: { cardCount: number; hasAction?: boolean }) {
  return (
    <View className="mb-6">
      <SkeletonSectionHeader hasAction={hasAction} widthClass="w-40" />
      <Rail
        className="px-4"
      >
        {Array.from({ length: cardCount }).map((_, index) => (
          <SkeletonCard index={index} key={index} />
        ))}
      </Rail>
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
export function FeedRowSkeleton({ hasAction = false }: { hasAction?: boolean }) {
  const { width } = useWindowDimensions();
  // +1 so the last card is clipped by the edge, like a real carousel.
  const cardCount = Math.ceil(width / (CARD_WIDTH + CARD_GAP)) + 1;

  return <SkeletonRow cardCount={cardCount} hasAction={hasAction} />;
}

// Must stay in sync with the Up Next card (w-64 = 256, h-36 art = 144).
const LANDSCAPE_WIDTH = 256;

/** Art plus two text lines below it, unlike the poster cards. */
function SkeletonLandscapeCard({ index }: { index: number }) {
  const delay = staggerDelay(index);
  return (
    <View className="w-64 mr-3">
      <Skeleton className="w-full h-36 rounded-lg" delay={delay} />
      <Skeleton className="h-4 w-2/3 rounded mt-2" delay={delay} />
      <Skeleton className="h-3 w-1/2 rounded mt-1.5" delay={delay} />
    </View>
  );
}

function SkeletonDayCell({ index }: { index: number }) {
  // Mirrors the real cell's internal stack (weekday · date · dot row) so the
  // strip is the same height here as once it resolves.
  const delay = staggerDelay(index);
  return (
    <View className="w-14 py-2 mr-2 items-center rounded-md bg-surface">
      <Skeleton className="h-4 w-7 rounded" delay={delay} />
      <Skeleton className="h-6 w-6 rounded" delay={delay} />
      <View className="h-1.5 mt-1" />
    </View>
  );
}

function SkeletonSectionHeader({ widthClass, hasAction = false }: { widthClass: string; hasAction?: boolean }) {
  return (
    <View className={cn('justify-center mb-3 mx-4', hasAction && 'min-h-11')}>
      <Skeleton className={cn('h-7', widthClass, 'rounded')} />
    </View>
  );
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
  const { width, fontScale } = useWindowDimensions();
  const cardCount = Math.ceil(width / (LANDSCAPE_WIDTH + CARD_GAP)) + 1;
  const dayCount = 7;
  const cardRailHeight = episodeCardRailHeight(fontScale);

  return (
    <View>
      {/* Continue Watching */}
      <CollapsibleSection collapseKey="up-next-continue" title="Continue Watching">
        <View style={{ height: cardRailHeight }}>
          <Rail className="px-4">
            {Array.from({ length: cardCount }).map((_, index) => (
              <SkeletonLandscapeCard index={index} key={index} />
            ))}
          </Rail>
        </View>
      </CollapsibleSection>

      {/* This week */}
      <CollapsibleSection collapseKey="up-next-calendar" title="This week">
        <Rail
          className="px-4"
        >
          {Array.from({ length: dayCount }).map((_, index) => (
            <SkeletonDayCell index={index} key={index} />
          ))}
        </Rail>
        <View className="mt-3" style={{ height: cardRailHeight + STACK_OFFSET * 2, paddingTop: STACK_OFFSET * 2 }}>
          <Rail
            className="px-4"
          >
            {Array.from({ length: cardCount }).map((_, index) => (
              <SkeletonLandscapeCard index={index} key={index} />
            ))}
          </Rail>
        </View>
      </CollapsibleSection>
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
