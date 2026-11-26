import { Text, View } from 'react-native';

import { ActionableRow } from '@/components/actionable-row';
import { List } from '@/components/List';
import { ProviderIcon } from '@/components/provider-icon';
import { RefreshControl } from '@/components/refresh-control';
import { SmallPoster } from '@/components/small-poster';
import { WatchedMark } from '@/components/watched-mark';
import type { MediaProgress } from '@/lib/media-progress';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { usePrefetchMediaDetails } from '@/state/queries/media-details';
import { useTraktMediaImages } from '@/state/queries/trakt';
import type { NormalizedMediaItem } from '@/types/media';

import type { MediaLayoutProps } from './types';

const TYPE_LABEL: Record<NormalizedMediaItem['type'], string> = {
  MOVIE: 'Film',
  TV: 'Series',
  ANIME: 'Anime',
  MANGA: 'Manga',
  BOOK: 'Book',
};

export function mediaKindLabel(item: NormalizedMediaItem): string {
  return item.type === 'ANIME' && item.isFilm === true ? 'Anime film' : TYPE_LABEL[item.type];
}

export function watchlistRowDetail(item: NormalizedMediaItem): string {
  const kind = mediaKindLabel(item);
  return item.year == null ? kind : `${item.year} · ${kind}`;
}

function RowPoster({ item }: { item: NormalizedMediaItem }) {
  // Trakt sync endpoints dropped images in 2026, so a Trakt-sourced watchlist
  // row has no art until this resolves it.
  const { coverImage } = useTraktMediaImages(item);
  return <SmallPoster uri={coverImage} recyclingKey={item.id} size="md" />;
}

const NO_SOURCES: readonly ProviderId[] = [];

function ProviderCluster({ providers }: { providers: readonly ProviderId[] }) {
  if (providers.length === 0) return null;
  const names = providers.map((id) => PROVIDERS[id].label).join(', ');
  return (
    <View accessibilityLabel={`On ${names}`} className="flex-row items-center gap-1.5">
      {providers.map((id) => (
        <ProviderIcon id={id} key={id} size={16} />
      ))}
    </View>
  );
}

export function WatchlistRow({
  item,
  sources = NO_SOURCES,
  onPress,
  onActions,
  watched,
  showActions,
  note,
}: {
  item: NormalizedMediaItem;
  sources?: readonly ProviderId[];
  onPress: (item: NormalizedMediaItem) => void;
  onActions: (item: NormalizedMediaItem) => void;
  watched?: MediaProgress;
  showActions?: boolean;
  note?: string;
}) {
  const prefetchDetails = usePrefetchMediaDetails();
  return (
    <ActionableRow
      className="px-6 py-2.5"
      href={routes.details(item.id, item.type)}
      item={item}
      leading={
        <>
          <RowPoster item={item} />
          <View className="shrink ml-4">
            <Text className="text-foreground font-sans-semibold text-base" numberOfLines={1}>
              {item.title}
            </Text>
            <Text className="text-muted font-sans text-xs mt-1">
              {note ?? watchlistRowDetail(item)}
            </Text>
          </View>
        </>
      }
      onActions={onActions}
      showActions={showActions}
      onPress={() => {
        prefetchDetails(item);
        onPress(item);
      }}
      trailing={
        <View className="flex-row items-center gap-2">
          {watched != null && <WatchedMark item={item} showProgress state={watched} />}
          <ProviderCluster providers={sources} />
        </View>
      }
    />
  );
}

export const ROW_HEIGHT = 92;

export function WatchlistRows({
  entries,
  onItemPress,
  onItemActions,
  onRefresh,
  onEndReached,
  footer,
  watched,
  showActions,
  itemLayoutAnimation,
}: MediaLayoutProps) {
  return (
    <List
      className="flex-1"
      contentContainerStyle={{ paddingTop: 4, paddingBottom: showActions ? 96 : undefined }}
      data={entries}
      extraData={watched}
      itemLayoutAnimation={itemLayoutAnimation}
      drawDistance={ROW_HEIGHT * 4}
      estimatedItemSize={ROW_HEIGHT}
      keyExtractor={(entry) => entry.id}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      // docs/solutions/diary-scroll-jank-is-row-mount-cost.md
      recycleItems
      refreshControl={<RefreshControl onRefresh={onRefresh} />}
      renderItem={({ item: entry }) => (
        <WatchlistRow
          item={entry.item}
          sources={entry.sources}
          onActions={onItemActions}
          onPress={onItemPress}
          showActions={showActions}
          watched={watched?.(entry.item)}
        />
      )}
      ListFooterComponent={footer}
    />
  );
}
