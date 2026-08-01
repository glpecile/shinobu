import { RefreshControl, Text, View } from 'react-native';

import { ActionableRow } from '@/components/actionable-row';
import { Image } from '@/components/image';
import { List } from '@/components/List';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { ProviderIcon } from '@/components/provider-icon';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { useTraktMediaImages } from '@/state/queries/trakt';
import type { NormalizedMediaItem } from '@/types/media';

import type { WatchlistEntry, WatchlistLayoutProps } from './types';

/**
 * `/watchlist`'s list layout (owner, 2026-08-01) — the alternative to the
 * poster wall, persisted per device by `state/prefs/watchlist-view`.
 *
 * Deliberately the **diary's** row, not a new one: same 48×72 poster, same
 * title-over-detail block, same provider marks pushed to the right edge, same
 * `ActionableRow` shell (press → details, long-press or the web hover ⋯ →
 * actions). Two surfaces that list the same kind of thing should not have two
 * row designs — a user who reads the diary as a list already knows how to read
 * this one.
 *
 * What it does *not* borrow is the diary's day grouping. A watchlist has no
 * meaningful date to group on: `addedAt` is absent for the Letterboxd leg
 * entirely (its scrape carries none) and would produce a "Sometime" bucket
 * holding most of the list.
 */

const TYPE_LABEL: Record<NormalizedMediaItem['type'], string> = {
  MOVIE: 'Film',
  TV: 'Series',
  ANIME: 'Anime',
  MANGA: 'Manga',
};

/** `2024 · Film`, degrading cleanly when the year is missing. */
export function watchlistRowDetail(item: NormalizedMediaItem): string {
  // Anime films are `ANIME` with `isFilm` (never a fifth MediaType), and the
  // distinction is worth surfacing here: it is what routes them to the movie
  // targets on a log.
  const kind =
    item.type === 'ANIME' && item.isFilm === true ? 'Anime film' : TYPE_LABEL[item.type];
  return item.year == null ? kind : `${item.year} · ${kind}`;
}

/** The 48×72 poster, lazily recovered when the provider row arrives artless. */
function RowPoster({ item }: { item: NormalizedMediaItem }) {
  // Trakt sync endpoints dropped images in 2026, so a Trakt-sourced watchlist
  // row has no art until this resolves it — same treatment as the diary's.
  const { coverImage } = useTraktMediaImages(item);
  if (coverImage === '') return <PosterPlaceholder className="w-12 h-[72px] rounded" />;
  return (
    <Image
      source={{ uri: coverImage }}
      className="w-12 h-[72px] rounded bg-surface border border-border/50"
      contentFit="cover"
      recyclingKey={item.id}
    />
  );
}

/** The provider marks holding this row, with a wrapping a11y label — like the
 *  diary's, no adjacent text names them. */
function ProviderCluster({ providers }: { providers: readonly ProviderId[] }) {
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
}: {
  entry: WatchlistEntry;
  onPress: (item: NormalizedMediaItem) => void;
  onActions: (item: NormalizedMediaItem) => void;
}) {
  return (
    <ActionableRow
      className="px-6 py-2.5"
      href={routes.details(entry.item.id)}
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
      onPress={() => onPress(entry.item)}
      trailing={<ProviderCluster providers={entry.sources} />}
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
}: WatchlistLayoutProps) {
  return (
    <List
      className="flex-1"
      contentContainerStyle={{ paddingTop: 4 }}
      data={entries}
      estimatedItemSize={ROW_HEIGHT}
      keyExtractor={(entry) => entry.id}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      refreshControl={
        <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
      }
      renderItem={({ item: entry }) => (
        <WatchlistRow entry={entry} onActions={onItemActions} onPress={onItemPress} />
      )}
      ListFooterComponent={footer}
    />
  );
}
