import { Text, View } from 'react-native';

import { MediaCarousel } from '@/components/media-carousel';
import { ProviderIcon } from '@/components/provider-icon';
import { Section } from '@/components/section';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { SuspenseSection } from '@/components/suspense-section';
import { Provider } from '@/lib/providers/types';
import { useSuspenseAniListRelationsQuery } from '@/state/queries/anilist';
import { useSuspenseHardcoverBooksQuery } from '@/state/queries/hardcover';
import { useSuspenseMediaDetailsQuery } from '@/state/queries/media-details';
import type { MediaType, NormalizedMediaItem } from '@/types/media';

/** Pulls the carousel's own `px-4` header and 16px card gutter out to the column's `px-6`. */
const ALIGN_TO_COLUMN = '-mx-4 -mb-6 mt-8';

function RelationsRow({ mediaId, type, onItemActions }: { mediaId: number; type: MediaType; onItemActions: (item: NormalizedMediaItem) => void }) {
  const { data } = useSuspenseAniListRelationsQuery({ mediaId, type });
  if (data.relations.length === 0) return null;
  return (
    <View className={ALIGN_TO_COLUMN}>
      <MediaCarousel
        collapseKey="details-relations"
        items={data.relations.map((relation) => relation.item)}
        onItemActions={onItemActions}
        leading={<ProviderIcon id={Provider.AniList} size={16} />}
        subtitles={Object.fromEntries(
          data.relations.map((relation) => [relation.item.id, relation.relation]),
        )}
        title="Related"
      />
    </View>
  );
}

function RecommendationsAndTags({ mediaId, type, onItemActions }: { mediaId: number; type: MediaType; onItemActions: (item: NormalizedMediaItem) => void }) {
  const { data } = useSuspenseAniListRelationsQuery({ mediaId, type });
  return (
    <>
      {data.recommendations.length > 0 && (
        <View className={ALIGN_TO_COLUMN}>
          <MediaCarousel
            collapseKey="details-recommendations"
            items={data.recommendations}
            onItemActions={onItemActions}
            leading={<ProviderIcon id={Provider.AniList} size={16} />}
            title="Recommendations"
          />
        </View>
      )}
      {data.tags.length > 0 && (
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
      )}
    </>
  );
}

/** Hardcover ranks up to 100; the rail shows the closest. */
const SIMILAR_BOOKS_LIMIT = 20;

function SimilarBooksCarousel({ ids, onItemActions }: { ids: readonly number[]; onItemActions: (item: NormalizedMediaItem) => void }) {
  const { data } = useSuspenseHardcoverBooksQuery(ids);
  if (data.length === 0) return null;
  return (
    <View className={ALIGN_TO_COLUMN}>
      <MediaCarousel
        collapseKey="details-similar-books"
        items={data}
        onItemActions={onItemActions}
        leading={<ProviderIcon id={Provider.Hardcover} size={16} />}
        title="Similar books"
      />
    </View>
  );
}

function SimilarBooks({ item, onItemActions }: { item: NormalizedMediaItem; onItemActions: (item: NormalizedMediaItem) => void }) {
  const { data } = useSuspenseMediaDetailsQuery(item);
  const ids = data.similarBookIds?.slice(0, SIMILAR_BOOKS_LIMIT) ?? [];
  if (ids.length === 0) return null;
  return <SimilarBooksCarousel ids={ids} onItemActions={onItemActions} />;
}

function CarouselSkeleton() {
  return (
    <View className="mt-8">
      <Skeleton className="h-6 w-24 rounded mb-4" />
      <View className="flex-row gap-3 overflow-hidden">
        {[0, 1, 2].map((index) => (
          <Skeleton
            className="w-40 h-60 rounded-lg"
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
 * without an AniList id renders nothing here. `RecommendationsAndTagsSection`
 * reads the same query, so both cost one request.
 */
export function RelationsSection({
  item,
  resetKey,
  onItemActions,
}: {
  item: NormalizedMediaItem;
  resetKey?: unknown;
  onItemActions: (item: NormalizedMediaItem) => void;
}) {
  if (item.externalIds.anilist == null) return null;
  return (
    <SuspenseSection fallback={<CarouselSkeleton />} resetKey={resetKey}>
      <RelationsRow mediaId={item.externalIds.anilist} onItemActions={onItemActions} type={item.type} />
    </SuspenseSection>
  );
}

export function RecommendationsAndTagsSection({
  item,
  resetKey,
  onItemActions,
}: {
  item: NormalizedMediaItem;
  resetKey?: unknown;
  onItemActions: (item: NormalizedMediaItem) => void;
}) {
  if (item.externalIds.anilist == null) return null;
  return (
    <SuspenseSection fallback={<CarouselSkeleton />} resetKey={resetKey}>
      <RecommendationsAndTags mediaId={item.externalIds.anilist} onItemActions={onItemActions} type={item.type} />
    </SuspenseSection>
  );
}

/**
 * Hardcover's "Similar books" for a book. The ids ride the book read the
 * credits already make, so the rail costs one request for the books.
 */
export function SimilarBooksSection({
  item,
  resetKey,
  onItemActions,
}: {
  item: NormalizedMediaItem;
  resetKey?: unknown;
  onItemActions: (item: NormalizedMediaItem) => void;
}) {
  if (item.externalIds.hardcover == null) return null;
  return (
    <SuspenseSection fallback={<CarouselSkeleton />} resetKey={resetKey}>
      <SimilarBooks item={item} onItemActions={onItemActions} />
    </SuspenseSection>
  );
}
