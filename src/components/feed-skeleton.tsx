import { View } from 'react-native';
import { useWindowDimensions } from '@/lib/window-dimensions';

import { Rail } from '@/components/rail';
import { ProviderIcon } from '@/components/provider-icon';
import { CollapsibleSection } from '@/components/collapsible-section';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { cn } from '@/lib/cn';
import { episodeCardRailHeight, STACK_OFFSET } from '@/features/up-next/ui/metrics';
import { Provider } from '@/lib/providers/types';

const CARD_WIDTH = 160;
const CARD_GAP = 12;

function SkeletonCard({ index }: { index: number }) {
  return <Skeleton className="w-40 h-60 rounded-lg mr-3" delay={staggerDelay(index)} />;
}

function SkeletonRow({ cardCount, hasAction = false }: { cardCount: number; hasAction?: boolean }) {
  return (
    <View className="mb-6">
      <SkeletonSectionHeader hasAction={hasAction} widthClass="w-40" />
      <Rail className="px-4">
        {Array.from({ length: cardCount }).map((_, index) => (
          <SkeletonCard index={index} key={index} />
        ))}
      </Rail>
    </View>
  );
}

export function FeedRowSkeleton({ hasAction = false }: { hasAction?: boolean }) {
  const { width } = useWindowDimensions();
  const cardCount = Math.ceil(width / (CARD_WIDTH + CARD_GAP)) + 1;

  return <SkeletonRow cardCount={cardCount} hasAction={hasAction} />;
}

const LANDSCAPE_WIDTH = 256;

function SkeletonLandscapeCard({
  index,
  hasAction = false,
}: {
  index: number;
  hasAction?: boolean;
}) {
  const delay = staggerDelay(index);
  return (
    <View className="w-64 mr-3">
      <Skeleton className="w-full h-36 rounded-lg" delay={delay} />
      <View className="flex-row items-start gap-2 mt-2">
        <View className="flex-1 min-w-0">
          <Skeleton className="h-4 w-2/3 rounded" delay={delay} />
          <Skeleton className="h-3 w-1/2 rounded mt-1.5" delay={delay} />
        </View>
        {hasAction && <Skeleton className="size-11 shrink-0 rounded-xl" delay={delay} />}
      </View>
    </View>
  );
}

export function LandscapeRowSkeleton() {
  const { width, fontScale } = useWindowDimensions();
  const cardCount = Math.ceil(width / (LANDSCAPE_WIDTH + CARD_GAP)) + 1;
  return (
    <CollapsibleSection
      collapseKey="serializd-coming-soon"
      leading={<ProviderIcon id={Provider.Serializd} size={16} />}
      title="Coming Soon"
    >
      <View
        style={{
          height: episodeCardRailHeight(fontScale, STACK_OFFSET * 2),
          paddingTop: STACK_OFFSET * 2,
        }}
      >
        <Rail className="px-4">
          {Array.from({ length: cardCount }).map((_, index) => (
            <SkeletonLandscapeCard index={index} key={index} />
          ))}
        </Rail>
      </View>
    </CollapsibleSection>
  );
}

const READING_WIDTH = 128;

export function ReadingRowSkeleton() {
  const { width, fontScale } = useWindowDimensions();
  const cardCount = Math.ceil(width / (READING_WIDTH + CARD_GAP)) + 1;
  return (
    <CollapsibleSection
      collapseKey="continue-reading"
      leading={<CollapsibleSection.Icon name="book-outline" />}
      title="Continue Reading"
    >
      <View style={{ height: episodeCardRailHeight(fontScale, 48) }}>
        <Rail className="px-4">
          {Array.from({ length: cardCount }).map((_, index) => {
            const delay = staggerDelay(index);
            return (
              <View className="w-32 mr-3" key={index}>
                <Skeleton className="w-32 h-48 rounded-lg" delay={delay} />
                <Skeleton className="h-4 w-2/3 rounded mt-2" delay={delay} />
                <Skeleton className="h-3 w-1/2 rounded mt-1.5" delay={delay} />
              </View>
            );
          })}
        </Rail>
      </View>
    </CollapsibleSection>
  );
}

function SkeletonDayCell({ index }: { index: number }) {
  const delay = staggerDelay(index);
  return (
    <View className="w-14 py-2 mr-2 items-center rounded-md bg-surface">
      <Skeleton className="h-3 w-7 rounded" delay={delay} />
      <Skeleton className="h-6 w-6 rounded mt-1" delay={delay} />
      <Skeleton className="size-1.5 rounded-full mt-1" delay={delay} />
    </View>
  );
}

function SkeletonSectionHeader({
  widthClass,
  hasAction = false,
}: {
  widthClass: string;
  hasAction?: boolean;
}) {
  return (
    <View className={cn('justify-center mb-3 mx-4', hasAction && 'min-h-11')}>
      <Skeleton className={cn('h-7', widthClass, 'rounded')} />
    </View>
  );
}

export function UpNextSectionSkeleton() {
  const { width, fontScale } = useWindowDimensions();
  const cardCount = Math.ceil(width / (LANDSCAPE_WIDTH + CARD_GAP)) + 1;
  const dayCount = 7;
  const cardRailHeight = episodeCardRailHeight(fontScale);

  return (
    <View>
      <CollapsibleSection
        collapseKey="up-next-continue"
        leading={<CollapsibleSection.Icon name="play-circle-outline" />}
        title="Continue Watching"
      >
        <View style={{ height: cardRailHeight }}>
          <Rail className="px-4">
            {Array.from({ length: cardCount }).map((_, index) => (
              <SkeletonLandscapeCard hasAction index={index} key={index} />
            ))}
          </Rail>
        </View>
      </CollapsibleSection>

      <CollapsibleSection
        collapseKey="up-next-calendar"
        leading={<CollapsibleSection.Icon name="calendar-outline" />}
        title="This week"
      >
        <Rail className="px-4">
          {Array.from({ length: dayCount }).map((_, index) => (
            <SkeletonDayCell index={index} key={index} />
          ))}
        </Rail>
        <View
          className="mt-3"
          style={{
            height: episodeCardRailHeight(fontScale, STACK_OFFSET * 2),
            paddingTop: STACK_OFFSET * 2,
          }}
        >
          <Rail className="px-4">
            {Array.from({ length: cardCount }).map((_, index) => (
              <SkeletonLandscapeCard index={index} key={index} />
            ))}
          </Rail>
        </View>
      </CollapsibleSection>
    </View>
  );
}

export function FeedSkeleton() {
  return (
    <View className="pt-2">
      <FeedRowSkeleton />
      <FeedRowSkeleton />
    </View>
  );
}
