import { Text, View } from 'react-native';

import { FeedRowSkeleton } from '@/components/feed-skeleton';
import { MediaCarousel } from '@/components/media-carousel';
import { ProviderIcon } from '@/components/provider-icon';
import { Section } from '@/components/section';
import { SuspenseSection } from '@/components/suspense-section';
import { Provider } from '@/lib/providers/types';
import { useSuspenseAniListRelationsQuery } from '@/state/queries/anilist';
import { useSuspenseHardcoverBooksQuery } from '@/state/queries/hardcover';
import { useSuspenseMediaDetailsQuery } from '@/state/queries/media-details';
import type { MediaType, NormalizedMediaItem } from '@/types/media';

const ALIGN_TO_COLUMN = '-mx-4 -mb-6 mt-8';

type CarouselHeader = {
  collapseKey: string;
  provider: typeof Provider.AniList | typeof Provider.Hardcover;
  title: string;
};

const RELATIONS_HEADER: CarouselHeader = {
  collapseKey: 'details-relations',
  provider: Provider.AniList,
  title: 'Related',
};

const RECOMMENDATIONS_HEADER: CarouselHeader = {
  collapseKey: 'details-recommendations',
  provider: Provider.AniList,
  title: 'Recommendations',
};

const SIMILAR_BOOKS_HEADER: CarouselHeader = {
  collapseKey: 'details-similar-books',
  provider: Provider.Hardcover,
  title: 'Similar books',
};

function RelationsRow({
  mediaId,
  type,
  onItemActions,
}: {
  mediaId: number;
  type: MediaType;
  onItemActions: (item: NormalizedMediaItem) => void;
}) {
  const { data } = useSuspenseAniListRelationsQuery({ mediaId, type });
  if (data.relations.length === 0) return null;
  return (
    <View className={ALIGN_TO_COLUMN}>
      <MediaCarousel
        collapseKey={RELATIONS_HEADER.collapseKey}
        items={data.relations.map((relation) => relation.item)}
        onItemActions={onItemActions}
        leading={<ProviderIcon id={RELATIONS_HEADER.provider} size={16} />}
        subtitles={Object.fromEntries(
          data.relations.map((relation) => [relation.item.id, relation.relation]),
        )}
        title={RELATIONS_HEADER.title}
      />
    </View>
  );
}

function RecommendationsAndTags({
  mediaId,
  type,
  onItemActions,
}: {
  mediaId: number;
  type: MediaType;
  onItemActions: (item: NormalizedMediaItem) => void;
}) {
  const { data } = useSuspenseAniListRelationsQuery({ mediaId, type });
  return (
    <>
      {data.recommendations.length > 0 && (
        <View className={ALIGN_TO_COLUMN}>
          <MediaCarousel
            collapseKey={RECOMMENDATIONS_HEADER.collapseKey}
            items={data.recommendations}
            onItemActions={onItemActions}
            leading={<ProviderIcon id={RECOMMENDATIONS_HEADER.provider} size={16} />}
            title={RECOMMENDATIONS_HEADER.title}
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

const SIMILAR_BOOKS_LIMIT = 20;

function SimilarBooksCarousel({
  ids,
  onItemActions,
}: {
  ids: readonly number[];
  onItemActions: (item: NormalizedMediaItem) => void;
}) {
  const { data } = useSuspenseHardcoverBooksQuery(ids);
  if (data.length === 0) return null;
  return (
    <View className={ALIGN_TO_COLUMN}>
      <MediaCarousel
        collapseKey={SIMILAR_BOOKS_HEADER.collapseKey}
        items={data}
        onItemActions={onItemActions}
        leading={<ProviderIcon id={SIMILAR_BOOKS_HEADER.provider} size={16} />}
        title={SIMILAR_BOOKS_HEADER.title}
      />
    </View>
  );
}

function SimilarBooks({
  item,
  onItemActions,
}: {
  item: NormalizedMediaItem;
  onItemActions: (item: NormalizedMediaItem) => void;
}) {
  const { data } = useSuspenseMediaDetailsQuery(item);
  const ids = data.similarBookIds?.slice(0, SIMILAR_BOOKS_LIMIT) ?? [];
  if (ids.length === 0) return null;
  return <SimilarBooksCarousel ids={ids} onItemActions={onItemActions} />;
}

function CarouselSkeleton({ header }: { header: CarouselHeader }) {
  return (
    <View className={ALIGN_TO_COLUMN}>
      <FeedRowSkeleton
        collapseKey={header.collapseKey}
        leading={<ProviderIcon id={header.provider} size={16} />}
        title={header.title}
      />
    </View>
  );
}

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
    <SuspenseSection fallback={<CarouselSkeleton header={RELATIONS_HEADER} />} resetKey={resetKey}>
      <RelationsRow
        mediaId={item.externalIds.anilist}
        onItemActions={onItemActions}
        type={item.type}
      />
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
    <SuspenseSection
      fallback={<CarouselSkeleton header={RECOMMENDATIONS_HEADER} />}
      resetKey={resetKey}
    >
      <RecommendationsAndTags
        mediaId={item.externalIds.anilist}
        onItemActions={onItemActions}
        type={item.type}
      />
    </SuspenseSection>
  );
}

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
    <SuspenseSection
      fallback={<CarouselSkeleton header={SIMILAR_BOOKS_HEADER} />}
      resetKey={resetKey}
    >
      <SimilarBooks item={item} onItemActions={onItemActions} />
    </SuspenseSection>
  );
}
