import { View } from 'react-native';

import { MediaCarousel } from '@/components/media-carousel';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { SuspenseSection } from '@/components/suspense-section';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { useSuspenseAniListRelationsQuery } from '@/state/queries/anilist';
import type { NormalizedMediaItem } from '@/types/media';

/** Pulls the carousel's own `px-4` header and 16px card gutter out to the column's `px-6`. */
const ALIGN_TO_COLUMN = '-mx-4 -mb-6 mt-8';

function RelationsRow({ mediaId }: { mediaId: number }) {
  const { data } = useSuspenseAniListRelationsQuery({ mediaId });
  const pushRoute = usePushRoute();
  if (data.length === 0) return null;
  return (
    <View className={ALIGN_TO_COLUMN}>
      <MediaCarousel
        collapseKey="details-relations"
        items={data.map((relation) => relation.item)}
        onItemPress={(item) => pushRoute(routes.details(item.id))}
        provider="anilist"
        subtitles={Object.fromEntries(
          data.map((relation) => [relation.item.id, relation.relation]),
        )}
        title="Related"
      />
    </View>
  );
}

function RelationsSkeleton() {
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

/**
 * AniList's relations graph (prequel, sequel, side story, adaptation…) for
 * any AniList-resolvable item; TMDB has no such API, so a TV/movie page
 * without an AniList id renders nothing here.
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
    <SuspenseSection fallback={<RelationsSkeleton />} resetKey={resetKey}>
      <RelationsRow mediaId={item.externalIds.anilist} />
    </SuspenseSection>
  );
}
