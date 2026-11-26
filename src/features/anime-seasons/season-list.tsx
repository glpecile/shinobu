import { useReducer, useState, type ReactElement } from 'react';
import { View } from 'react-native';

import { List, type ListProps } from '@/components/List';
import { RailHead } from '@/components/rail-head';
import { Button } from '@/components/button';
import { RefreshControl } from '@/components/refresh-control';
import { PosterCell, useWallMetrics } from '@/features/media-layout/poster-wall';
import { ROW_HEIGHT, WatchlistRow } from '@/features/media-layout/watchlist-rows';
import { findAniListProgress } from '@/lib/media-progress';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { localDayAt } from '@/lib/time/relative-day';
import { useWakeAt } from '@/lib/time/use-wake-at';
import { setSectionCollapsed, useSectionCollapsed } from '@/state/prefs/collapsed-sections';
import { useWatchlistView } from '@/state/prefs/watchlist-view';
import { useConnectedProviders } from '@/state/session';
import {
  useItemProgress,
  useProgressLibraries,
  type ProgressLibraries,
} from '@/state/queries/media-progress';
import { findLibraryEntry } from '@/state/queries/simkl';
import type { NormalizedMediaItem } from '@/types/media';

import {
  airingNote,
  airingWhen,
  seasonRows,
  seasonShelf,
  type LibraryStatus,
  type NextAiring,
  type SeasonRow,
  type SeasonShelf,
} from './season-shelves';
import { ShelvesSkeleton, WallSkeleton } from './wall-skeleton';

const SHELF_TITLE: Record<SeasonShelf, string> = {
  watching: 'Watching',
  planned: 'On your watchlist',
  seen: 'Seen',
  rest: 'New to you',
};

const SHELF_ICON = {
  watching: 'play-circle-outline',
  planned: 'bookmark-outline',
  seen: 'eye-outline',
  rest: 'compass-outline',
} as const satisfies Record<SeasonShelf, string>;

const HEAD_HEIGHT = 64;

function libraryStatus(item: NormalizedMediaItem, libraries: ProgressLibraries): LibraryStatus {
  const anilist =
    libraries.connected.includes(Provider.AniList) && libraries.indexes.anilist != null
      ? findAniListProgress(item, libraries.indexes.anilist)?.status
      : undefined;
  const simkl =
    libraries.connected.includes(Provider.Simkl) && libraries.indexes.simkl != null
      ? findLibraryEntry(libraries.indexes.simkl, item)?.status
      : undefined;
  if (anilist === 'CURRENT' || anilist === 'REPEATING' || simkl === 'watching') return 'watching';
  if (anilist === 'PLANNING' || simkl === 'plantowatch') return 'planned';
  return undefined;
}

function countLabel(row: Extract<SeasonRow, { kind: 'head' }>, now: Date): string {
  const count = `${row.count} ${row.count === 1 ? 'title' : 'titles'}`;
  return !row.open && row.next != null
    ? `${count} · next ${airingWhen(row.next.airingAt, now)}`
    : count;
}

/** Only AniList and Simkl key anime by AniList/MAL ids; Trakt and Letterboxd records carry neither. */
function canShelve(connected: readonly ProviderId[]): boolean {
  return connected.includes(Provider.AniList) || connected.includes(Provider.Simkl);
}

export function SeasonSkeleton({ animated }: { animated: boolean }) {
  return canShelve(useConnectedProviders()) ? (
    <ShelvesSkeleton animated={animated} />
  ) : (
    <WallSkeleton animated={animated} />
  );
}

function newDate(): Date {
  return new Date();
}

export function SeasonList({
  items,
  nextAiring,
  active,
  footer,
  onEndReached,
  onItemActions,
  onItemPress,
  onRefresh,
}: {
  items: readonly NormalizedMediaItem[];
  nextAiring: Readonly<Record<string, NextAiring>>;
  active: boolean;
  footer: ReactElement;
  onEndReached: (() => void) | undefined;
  onItemActions: (item: NormalizedMediaItem) => void;
  onItemPress: (item: NormalizedMediaItem) => void;
  onRefresh: () => Promise<unknown>;
}) {
  const view = useWatchlistView();
  const { columns, rowHeight } = useWallMetrics();
  const libraries = useProgressLibraries(items);
  const progress = useItemProgress(items, libraries);
  const folded = new Set<SeasonShelf>();
  if (useSectionCollapsed('anime-seasons-watching')) folded.add('watching');
  if (useSectionCollapsed('anime-seasons-planned')) folded.add('planned');
  if (useSectionCollapsed('anime-seasons-seen')) folded.add('seen');
  if (useSectionCollapsed('anime-seasons-rest')) folded.add('rest');
  // State instead of `new Date()` so React Compiler doesn't cache the timestamp across renders.
  const [now, refreshNow] = useReducer(newDate, undefined, newDate);
  const soonest = Math.min(
    localDayAt(1, now).getTime(),
    ...Object.values(nextAiring)
      .map((next) => Date.parse(next.airingAt))
      .filter((at) => at > now.getTime()),
  );
  useWakeAt(soonest, now, refreshNow);

  const settling = [libraries.queries.anilist, libraries.queries.simkl].some(
    (query) => query.isEnabled && query.isPending,
  );
  if (settling) return <SeasonSkeleton animated={active} />;
  const failedLibraries = [libraries.queries.anilist, libraries.queries.simkl].filter(
    (query) => query.isEnabled && query.isError,
  );

  const progressById = new Map(
    progress.items.map((item, index) => [item.id, progress.progress[index]]),
  );
  const rows = seasonRows(
    progress.items,
    (item) => {
      const state = progressById.get(item.id);
      return state == null ? 'rest' : seasonShelf(state, libraryStatus(item, libraries));
    },
    nextAiring,
    { folded, now, ...(view === 'grid' ? { columns } : {}) },
  );

  return (
    <ShelfList
      // Remount on view switch so recycled container sizes from poster rows don't carry into list rows.
      key={view}
      className="flex-1"
      contentContainerStyle={{ paddingTop: 4 }}
      data={rows}
      now={now}
      drawDistance={view === 'grid' ? rowHeight * (active ? 8 : 2) : ROW_HEIGHT * 4}
      estimatedItemSize={view === 'grid' ? rowHeight : ROW_HEIGHT}
      getFixedItemSize={(row) => (row.kind === 'head' ? HEAD_HEIGHT : undefined)}
      getItemType={(row) => row.kind}
      keyExtractor={(row) => row.key}
      ListFooterComponent={footer}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      // docs/solutions/diary-scroll-jank-is-row-mount-cost.md — poster cells are keyed by column for reuse.
      recycleItems
      ListHeaderComponent={
        failedLibraries.length > 0 ? (
          <View className="items-center mt-3 mb-4">
            <Button
              icon={<Button.Icon name="refresh" />}
              label="Couldn’t load your library"
              onPress={() => {
                void Promise.all(failedLibraries.map((query) => query.refetch()));
              }}
              size="sm"
              variant="quiet"
            />
          </View>
        ) : undefined
      }
      refreshControl={
        <RefreshControl
          onRefresh={() =>
            Promise.all([
              onRefresh(),
              ...[libraries.queries.anilist, libraries.queries.simkl]
                .filter((query) => query.isEnabled)
                .map((query) => query.refetch()),
            ])
          }
        />
      }
      renderItem={({ item: row }) => {
        switch (row.kind) {
          case 'head':
            return (
              <RailHead
                label={`${SHELF_TITLE[row.key]}, ${row.count} ${row.count === 1 ? 'title' : 'titles'}`}
                onToggle={() => setSectionCollapsed(`anime-seasons-${row.key}`, row.open)}
                open={row.open}
              >
                <RailHead.Icon name={SHELF_ICON[row.key]} showRail={false}>
                  {SHELF_TITLE[row.key]}
                </RailHead.Icon>
                <RailHead.Count>{countLabel(row, now)}</RailHead.Count>
              </RailHead>
            );
          case 'posters':
            return (
              <View className="flex-row px-2">
                {row.items.map((item, column) => (
                  <View className="flex-1 min-w-0" key={column}>
                    <PosterCell
                      item={item}
                      note={airingNote(nextAiring[item.id], now)}
                      onActions={onItemActions}
                      onPress={onItemPress}
                      watched={progressById.get(item.id)}
                    />
                  </View>
                ))}
                {Array.from({ length: columns - row.items.length }, (_, index) => (
                  <View className="flex-1" key={`empty-${index}`} />
                ))}
              </View>
            );
          case 'entry':
            return (
              <WatchlistRow
                item={row.item}
                note={airingNote(nextAiring[row.item.id], now)}
                onActions={onItemActions}
                onPress={onItemPress}
                watched={progressById.get(row.item.id)}
              />
            );
        }
      }}
    />
  );
}

function ShelfList({
  data,
  now,
  ...props
}: Omit<ListProps<SeasonRow>, 'data' | 'onViewableItemsChanged'> & {
  data: readonly SeasonRow[];
  now: Date;
}) {
  const [pinned, setPinned] = useState<{ shelf: SeasonShelf | null; visible: boolean }>({
    shelf: null,
    visible: false,
  });
  const shelved = data.some((row) => row.kind === 'head');
  // A find, not a lookup Map: React Compiler would tie the Map, and with it the
  // list's viewability handler, to the pin, and hand the list a new handler per pin.
  const pinnedHead = data.find(
    (row): row is Extract<SeasonRow, { kind: 'head' }> =>
      row.kind === 'head' && row.key === pinned.shelf,
  );

  function handleViewableItemsChanged({
    viewableItems,
  }: {
    viewableItems: Array<{ index: number; item: SeasonRow }>;
  }) {
    let top = viewableItems[0];
    for (const token of viewableItems) if (token.index < top.index) top = token;
    const shelf = top == null || top.item.kind === 'head' || !shelved ? null : top.item.shelf;
    setPinned((previous) => {
      if (shelf == null) return previous.visible ? { ...previous, visible: false } : previous;
      return previous.visible && previous.shelf === shelf ? previous : { shelf, visible: true };
    });
  }

  return (
    <View className="flex-1">
      <List {...props} data={data} onViewableItemsChanged={handleViewableItemsChanged} />
      {pinnedHead != null && (
        <RailHead.Pinned
          count={countLabel(pinnedHead, now)}
          icon={SHELF_ICON[pinnedHead.key]}
          title={SHELF_TITLE[pinnedHead.key]}
          visible={pinned.visible}
        />
      )}
    </View>
  );
}
