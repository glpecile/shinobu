import { RefreshControl, Text, View } from 'react-native';

import { ActionableRow } from '@/components/actionable-row';
import { List } from '@/components/List';
import { ProviderIcon } from '@/components/provider-icon';
import { SmallPoster } from '@/components/small-poster';
import { WatchedMark } from '@/components/watched-mark';
import type { WatchlistEntry } from '@/features/watchlist/types';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { useTraktMediaImages } from '@/state/queries/trakt';
import type { NormalizedMediaItem } from '@/types/media';

import type { MediaLayoutProps } from './types';

/**
 * List layout for watchlists and catalogues, with 48×72 posters, type labels,
 * and optional provider/watched marks. Shares ActionableRow's interaction
 * shell with the diary, not its smaller posters, log details, or day grouping.
 * Screens own data, paging, filtering, and failure states.
 */

const TYPE_LABEL: Record<NormalizedMediaItem['type'], string> = {
  MOVIE: 'Film',
  TV: 'Series',
  ANIME: 'Anime',
  MANGA: 'Manga',
};

/**
 * "Film" / "Series" / "Anime film". Anime films are `ANIME` with `isFilm`
 * (never a fifth MediaType), and the distinction is worth surfacing: it is
 * what routes them to the movie targets on a log.
 */
export function mediaKindLabel(item: NormalizedMediaItem): string {
  return item.type === 'ANIME' && item.isFilm === true ? 'Anime film' : TYPE_LABEL[item.type];
}

/** `2024 · Film`, degrading cleanly when the year is missing. */
export function watchlistRowDetail(item: NormalizedMediaItem): string {
  const kind = mediaKindLabel(item);
  return item.year == null ? kind : `${item.year} · ${kind}`;
}

/** The 48×72 poster, lazily recovered when the provider row arrives artless. */
function RowPoster({ item }: { item: NormalizedMediaItem }) {
  // Trakt sync endpoints dropped images in 2026, so a Trakt-sourced watchlist
  // row has no art until this resolves it.
  const { coverImage } = useTraktMediaImages(item);
  return <SmallPoster uri={coverImage} recyclingKey={item.id} size="md" />;
}

/** The provider marks holding this row, with a wrapping a11y label — like the
 *  diary's, no adjacent text names them. */
function ProviderCluster({ providers }: { providers: readonly ProviderId[] }) {
  // A catalogue list (the seasons explorer) has no provenance to show.
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

function WatchlistRow({
  entry,
  onPress,
  onActions,
  showWatched,
  showActions,
}: {
  entry: WatchlistEntry;
  onPress: (item: NormalizedMediaItem) => void;
  onActions: (item: NormalizedMediaItem) => void;
  showWatched?: boolean;
  showActions?: boolean;
}) {
  return (
    <ActionableRow
      className="px-6 py-2.5"
      href={routes.details(entry.item.id, entry.item.type)}
      item={entry.item}
      leading={
        <>
          <RowPoster item={entry.item} />
          <View className="shrink ml-4">
            <Text
              className="text-foreground font-sans-semibold text-base"
              numberOfLines={1}
            >
              {entry.item.title}
            </Text>
            <Text className="text-muted font-sans text-xs mt-1">
              {watchlistRowDetail(entry.item)}
            </Text>
          </View>
        </>
      }
      onActions={onActions}
      showActions={showActions}
      onPress={() => onPress(entry.item)}
      trailing={
        <View className="flex-row items-center gap-2">
          {showWatched && <WatchedMark item={entry.item} showProgress />}
          <ProviderCluster providers={entry.sources} />
        </View>
      }
    />
  );
}

/** Row height incl. padding — feeds `estimatedItemSize` only. */
const ROW_HEIGHT = 92;

export function WatchlistRows({
  entries,
  onItemPress,
  onItemActions,
  refreshing,
  onRefresh,
  onEndReached,
  footer,
  showWatched,
  showActions,
  itemLayoutAnimation,
}: MediaLayoutProps) {
  return (
    <List
      className="flex-1"
      contentContainerStyle={{ paddingTop: 4, paddingBottom: showActions ? 96 : undefined }}
      data={entries}
      itemLayoutAnimation={itemLayoutAnimation}
      // Four rows ahead so a fast fling doesn't outrun the mounts — see
      // poster-wall.tsx.
      drawDistance={ROW_HEIGHT * 4}
      estimatedItemSize={ROW_HEIGHT}
      keyExtractor={(entry) => entry.id}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      // Recycle to avoid row mount cost, as in the diary
      // (docs/solutions/diary-scroll-jank-is-row-mount-cost.md); the same
      // stale-hover residual applies.
      recycleItems
      refreshControl={
        <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
      }
      // No `entering` on rows — see poster-wall.tsx.
      renderItem={({ item: entry }) => (
        <WatchlistRow entry={entry} onActions={onItemActions} onPress={onItemPress} showActions={showActions} showWatched={showWatched} />
      )}
      ListFooterComponent={footer}
    />
  );
}
