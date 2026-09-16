import { Text, View } from 'react-native';

import { MediaCarousel } from '@/components/media-carousel';
import { Section } from '@/components/section';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { SuspenseSection } from '@/components/suspense-section';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { useSuspenseAniListRelationsQuery } from '@/state/queries/anilist';
import type { MediaType, NormalizedMediaItem } from '@/types/media';

/** Pulls the carousel's own `px-4` header and 16px card gutter out to the column's `px-6`. */
const ALIGN_TO_COLUMN = '-mx-4 -mb-6 mt-8';

function RelationsRow({ mediaId, type }: { mediaId: number; type: MediaType }) {
  const { data } = useSuspenseAniListRelationsQuery({ mediaId, type });
  const pushRoute = usePushRoute();
  if (data.relations.length === 0) return null;
  return (
    <View className={ALIGN_TO_COLUMN}>
      <MediaCarousel
        collapseKey="details-relations"
        items={data.relations.map((relation) => relation.item)}
        onItemPress={(item) => pushRoute(routes.details(item.id))}
        provider="anilist"
        subtitles={Object.fromEntries(
          data.relations.map((relation) => [relation.item.id, relation.relation]),
        )}
        title="Related"
      />
    </View>
  );
}

function RecommendationsRow({ mediaId, type }: { mediaId: number; type: MediaType }) {
  const { data } = useSuspenseAniListRelationsQuery({ mediaId, type });
  const pushRoute = usePushRoute();
  if (data.recommendations.length === 0) return null;
  return (
    <View className={ALIGN_TO_COLUMN}>
      <MediaCarousel
        collapseKey="details-recommendations"
        items={data.recommendations}
        onItemPress={(item) => pushRoute(routes.details(item.id))}
        provider="anilist"
        title="Recommendations"
      />
    </View>
  );
}

function TagsList({ mediaId, type }: { mediaId: number; type: MediaType }) {
  const { data } = useSuspenseAniListRelationsQuery({ mediaId, type });
  if (data.tags.length === 0) return null;
  return (
    <Section>
      <Section.Header>
        <Section.Title>Tags</Section.Title>
      </Section.Header>
      <View className="flex-row flex-wrap gap-2">
        {data.tags.map((tag) => (
          <View className="bg-surface border border-border rounded-full px-3 py-1.5" key={tag}>
            <Text className="text-muted font-sans text-xs">{tag}</Text>
          </View>
        ))}
      </View>
    </Section>
  );
}

function CarouselSkeleton() {
  return (
    <View className="mt-8">
      <Skeleton className="h-6 w-24 rounded mb-4" />
      <View className="flex-row gap-3 overflow-hidden">
        {[0, 1, 2].map((index) => (
          <Skeleton
            className="w-40 h-60 rounded-card"
            delay={staggerDelay(index)}
            key={index}
          />
        ))}
      </View>
    </View>
  );
}

function TagsSkeleton() {
  return (
    <View className="mt-8">
      <Skeleton className="h-6 w-16 rounded mb-4" />
      <View className="flex-row flex-wrap gap-2">
        <Skeleton className="h-7 w-20 rounded-full" delay={staggerDelay(0)} />
        <Skeleton className="h-7 w-28 rounded-full" delay={staggerDelay(1)} />
        <Skeleton className="h-7 w-16 rounded-full" delay={staggerDelay(2)} />
        <Skeleton className="h-7 w-24 rounded-full" delay={staggerDelay(3)} />
      </View>
    </View>
  );
}

/**
 * AniList's relations graph (prequel, sequel, side story, adaptation…) for
 * any AniList-resolvable item; TMDB has no such API, so a TV/movie page
 * without an AniList id renders nothing here. The recommendations and tags
 * sections below read the same query, so all three cost one request.
 */
export function RelationsSection({
  item,
  resetKey,
}: {
  item: NormalizedMediaItem;
  resetKey?: unknown;
}) {
  if (item.externalIds.anilist == null) return null;
  return (
    <SuspenseSection fallback={<CarouselSkeleton />} resetKey={resetKey}>
      <RelationsRow mediaId={item.externalIds.anilist} type={item.type} />
    </SuspenseSection>
  );
}

export function RecommendationsSection({
  item,
  resetKey,
}: {
  item: NormalizedMediaItem;
  resetKey?: unknown;
}) {
  if (item.externalIds.anilist == null) return null;
  return (
    <SuspenseSection fallback={<CarouselSkeleton />} resetKey={resetKey}>
      <RecommendationsRow mediaId={item.externalIds.anilist} type={item.type} />
    </SuspenseSection>
  );
}

export function TagsSection({
  item,
  resetKey,
}: {
  item: NormalizedMediaItem;
  resetKey?: unknown;
}) {
  if (item.externalIds.anilist == null) return null;
  return (
    <SuspenseSection fallback={<TagsSkeleton />} resetKey={resetKey}>
      <TagsList mediaId={item.externalIds.anilist} type={item.type} />
    </SuspenseSection>
  );
}
