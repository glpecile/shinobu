import { useReducer, useState, type ReactElement } from 'react';
import { View } from 'react-native';

import { List } from '@/components/List';
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
import { useItemProgress, useProgressLibraries, type ProgressLibraries } from '@/state/queries/media-progress';
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

/** The home rails' glyphs for the same ideas, the posters' watched eye, and discovery for the rest. */
const SHELF_ICON = {
  watching: 'play-circle-outline',
  planned: 'bookmark-outline',
  seen: 'eye-outline',
  rest: 'compass-outline',
} as const satisfies Record<SeasonShelf, string>;

/** A head is `RailHead.Icon`'s fixed frame: `pt-5`, the 32px ring, `pb-3`. */
const HEAD_HEIGHT = 64;

/** What the user's libraries say about a title beyond its progress. */
function libraryStatus(item: NormalizedMediaItem, libraries: ProgressLibraries): LibraryStatus {
  const anilist = libraries.connected.includes(Provider.AniList) && libraries.indexes.anilist != null
    ? findAniListProgress(item, libraries.indexes.anilist)?.status
    : undefined;
  const simkl = libraries.connected.includes(Provider.Simkl) && libraries.indexes.simkl != null
    ? findLibraryEntry(libraries.indexes.simkl, item)?.status
    : undefined;
  if (anilist === 'CURRENT' || anilist === 'REPEATING' || simkl === 'watching') return 'watching';
  if (anilist === 'PLANNING' || simkl === 'plantowatch') return 'planned';
  return undefined;
}

function countLabel(row: Extract<SeasonRow, { kind: 'head' }>, now: Date): string {
  const count = `${row.count} ${row.count === 1 ? 'title' : 'titles'}`;
  // An open shelf's first title already says when it airs.
  return !row.open && row.next != null ? `${count} · next ${airingWhen(row.next.airingAt, now)}` : count;
}

/**
 * Whether a session can put a season's titles on shelves: AniList and Simkl
 * key anime by AniList and MAL ids. Trakt and Letterboxd records carry neither,
 * so their users get the plain wall.
 */
function canShelve(connected: readonly ProviderId[]): boolean {
  return connected.includes(Provider.AniList) || connected.includes(Provider.Simkl);
}

/** The season's loading state: shelves for a session that will show them, the plain wall otherwise. */
export function SeasonSkeleton({ animated }: { animated: boolean }) {
  return canShelve(useConnectedProviders()) ? <ShelvesSkeleton animated={animated} /> : <WallSkeleton animated={animated} />;
}

function newDate(): Date {
  return new Date();
}

/**
 * One cour of the explorer, the user's titles first: Watching, On your
 * watchlist and Seen fold above New to you on the filmography's rail
 * heads, and each title says when its next episode airs. Folds persist per
 * shelf, across seasons, and start open.
 *
 * Shelves come from the library snapshots list progress already reads, one
 * request per connected provider, never one per title. The wall waits on its
 * skeleton until they settle, so a title never paints in New to you and
 * then jumps to its shelf.
 */
export function SeasonList({
  items,
  nextAiring,
  animated,
  footer,
  onEndReached,
  onItemActions,
  onItemPress,
  onRefresh,
}: {
  items: readonly NormalizedMediaItem[];
  nextAiring: Readonly<Record<string, NextAiring>>;
  /** The skeleton's shimmer, off for a page the pager holds offscreen. */
  animated: boolean;
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
  // Fixed calls, not a loop over the shelves: each is a hook.
  const folded = new Set<SeasonShelf>();
  if (useSectionCollapsed('anime-seasons-watching')) folded.add('watching');
  if (useSectionCollapsed('anime-seasons-planned')) folded.add('planned');
  if (useSectionCollapsed('anime-seasons-seen')) folded.add('seen');
  if (useSectionCollapsed('anime-seasons-rest')) folded.add('rest');
  const [pinned, setPinned] = useState<{ shelf: SeasonShelf | null; visible: boolean }>({ shelf: null, visible: false });
  // State, not an ambient `new Date()`, which React Compiler would cache. It
  // wakes at the soonest airing, so that title drops its note, and at midnight.
  const [now, refreshNow] = useReducer(newDate, undefined, newDate);
  const soonest = Math.min(
    localDayAt(1, now).getTime(),
    ...Object.values(nextAiring).map((next) => Date.parse(next.airingAt)).filter((at) => at > now.getTime()),
  );
  useWakeAt(soonest, now, refreshNow);

  // Only the libraries that can shelve a title; Trakt's watched films never
  // match an AniList film, so waiting on them would only delay the wall.
  const settling = [libraries.queries.anilist, libraries.queries.simkl].some((query) => query.isEnabled && query.isPending);
  if (settling) return <SeasonSkeleton animated={animated} />;
  const failedLibraries = [libraries.queries.anilist, libraries.queries.simkl].filter((query) => query.isEnabled && query.isError);

  const progressById = new Map(progress.items.map((item, index) => [item.id, progress.progress[index]]));
  const rows = seasonRows(
    progress.items,
    (item) => {
      const state = progressById.get(item.id);
      return state == null ? 'rest' : seasonShelf(state, libraryStatus(item, libraries));
    },
    nextAiring,
    { folded, now, ...(view === 'grid' ? { columns } : {}) },
  );
  const heads = new Map(rows.flatMap((row) => (row.kind === 'head' ? [[row.key, row] as const] : [])));
  const pinnedHead = pinned.shelf == null ? undefined : heads.get(pinned.shelf);

  function handleViewableItemsChanged({ viewableItems }: { viewableItems: Array<{ index: number; item: SeasonRow }> }) {
    let top = viewableItems[0];
    for (const token of viewableItems) if (token.index < top.index) top = token;
    const shelf = top == null || top.item.kind === 'head' || heads.size === 0 ? null : top.item.shelf;
    // Hiding keeps the last shelf so the bar fades out with its title.
    setPinned((previous) => {
      if (shelf == null) return previous.visible ? { ...previous, visible: false } : previous;
      return previous.visible && previous.shelf === shelf ? previous : { shelf, visible: true };
    });
  }

  return (
    <View className="flex-1">
      <List
        // Remount on a view switch: containers sized for poster rows run
        // short for list rows, as two separate lists never did.
        key={view}
        className="flex-1"
        contentContainerStyle={{ paddingTop: 4 }}
        data={rows}
        // Two rows ahead, as on the poster wall: a fast fling outran the default.
        drawDistance={view === 'grid' ? rowHeight * 2 : ROW_HEIGHT * 4}
        estimatedItemSize={view === 'grid' ? rowHeight : ROW_HEIGHT}
        // Exact for heads, so a screen of short heads doesn't outrun the
        // containers a poster-row estimate allotted.
        getFixedItemSize={(row) => (row.kind === 'head' ? HEAD_HEIGHT : undefined)}
        getItemType={(row) => row.kind}
        keyExtractor={(row) => row.key}
        ListFooterComponent={footer}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        onViewableItemsChanged={handleViewableItemsChanged}
        // Recycled like the poster wall: mounting a screenful of fresh cells
        // is what blanks a fling (docs/solutions/diary-scroll-jank-is-row-mount-cost.md).
        // Rows are prop-derived, and poster cells are keyed by column so a
        // recycled row reuses them instead of remounting.
        recycleItems
        ListHeaderComponent={failedLibraries.length > 0 ? (
          <View className="items-center mt-3 mb-4">
            <Button icon={<Button.Icon name="refresh" />} label="Couldn’t load your library" onPress={() => { void Promise.all(failedLibraries.map((query) => query.refetch())); }} size="sm" variant="quiet" />
          </View>
        ) : undefined}
        refreshControl={<RefreshControl onRefresh={() => Promise.all([onRefresh(), ...[libraries.queries.anilist, libraries.queries.simkl].filter((query) => query.isEnabled).map((query) => query.refetch())])} />}
        renderItem={({ item: row }) => {
          switch (row.kind) {
            case 'head':
              return (
                <RailHead
                  label={`${SHELF_TITLE[row.key]}, ${row.count} ${row.count === 1 ? 'title' : 'titles'}`}
                  onToggle={() => setSectionCollapsed(`anime-seasons-${row.key}`, row.open)}
                  open={row.open}
                >
                  <RailHead.Icon name={SHELF_ICON[row.key]} showRail={false}>{SHELF_TITLE[row.key]}</RailHead.Icon>
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
