import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import { List } from '@/components/List';
import { OverlayActionsButton } from '@/components/overlay-actions-button';
import { PosterFace } from '@/components/poster-face';
import { PresstableScale } from '@/components/presstable';
import { RefreshControl } from '@/components/refresh-control';
import { WatchedMark } from '@/components/watched-mark';
import type { MediaProgress } from '@/lib/media-progress';
import { usePreloadRoute } from '@/lib/navigation';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { usePrefetchMediaDetails } from '@/state/queries/media-details';
import type { NormalizedMediaItem } from '@/types/media';

import type { MediaLayoutProps } from './types';

/**
 * The screen owns data, paging and failure states; this owns only how the
 * loaded films are laid out — chosen from four prototyped treatments on
 * 2026-07-25.
 */

/** Poster proportions (width ÷ height) — the universal 2:3 one-sheet. */
const POSTER_ASPECT = 2 / 3;
/** Gutter between posters, in px. Deliberately tight: this is a wall, not a grid of cards. */
const GAP = 8;
/** Outer breathing room at the screen edges, in px. */
const EDGE_PAD = 12;
/**
 * The poster width the layout aims for. Columns are whatever fits, so posters
 * stay roughly this size at every breakpoint instead of the count being fixed.
 */
const TARGET_COLUMN_PITCH = 132;
const MIN_COLUMNS = 3;
/** Tall enough that the caption's fade starts well above its first line. */
const CAPTION_SCRIM_HEIGHT = 96;
/** One line of `note` text with room for the fade to start above it. */
const NOTE_SCRIM_HEIGHT = 48;
/** Past this the artwork is too small to recognize, however wide the display. */
const MAX_COLUMNS = 8;
/** Shared, so a cell without provenance keeps the same props across renders. */
const NO_SOURCES: readonly ProviderId[] = [];
/** The web sidebar from `md` (768px) up: the app shell's expanded `md:w-60` plus its border. */
const WEB_SIDEBAR_WIDTH = 241;

/** Exported for the explorer's skeleton, so it lays out the same columns the wall will. */
export function useWallMetrics(): { columns: number; rowHeight: number } {
  const { width } = useWindowDimensions();
  const usable = width - 2 * EDGE_PAD;
  const columns = Math.min(
    MAX_COLUMNS,
    Math.max(MIN_COLUMNS, Math.floor(usable / TARGET_COLUMN_PITCH)),
  );
  // Only feeds `estimatedItemSize`: the real cells are percentage-width (see
  // PosterCell) of the area beside the web sidebar. An estimate taller than
  // the real rows leaves Legend List short of containers, so this takes the
  // expanded sidebar off; a collapsed one only adds spare containers.
  const contentWidth =
    process.env.EXPO_OS === 'web' && width >= 768 ? usable - WEB_SIDEBAR_WIDTH : usable;
  const posterWidth = (contentWidth - GAP * (columns - 1)) / columns;
  return { columns, rowHeight: posterWidth / POSTER_ASPECT + GAP };
}

/**
 * One poster. No type label at rest: on a watchlist "MOVIE" on every card is
 * noise, and the artwork already carries its own title, so burning ours over
 * it buys nothing. The title stays reachable through `accessibilityLabel`
 * everywhere and a hover caption on web. The provider marks are the one piece
 * of chrome that *is* always on — see `PosterMarks`.
 */
export function PosterCell({
  item,
  sources = NO_SOURCES,
  onPress,
  onActions,
  watched,
  showActions,
  note,
}: {
  item: NormalizedMediaItem;
  /** The providers holding it; a catalogue list (the seasons explorer) has none. */
  sources?: readonly ProviderId[];
  onPress: (item: NormalizedMediaItem) => void;
  onActions: (item: NormalizedMediaItem) => void;
  watched?: MediaProgress;
  showActions?: boolean;
  /** One always-on line at the poster's foot, e.g. when the next episode airs. Takes the progress pill's place. */
  note?: string;
}) {
  const prefetchDetails = usePrefetchMediaDetails();
  const preloadRoute = usePreloadRoute();
  // JS hover state, not CSS: uniwind has no `group-hover:`, so the web-only
  // reveal rides on RN-web's pointer events (same approach as MediaCard).
  const [hovered, setHovered] = useState(false);
  // The list recycles cells, so a hovered cell scrolled off and reused for
  // another poster would carry its caption along; drop it when the item
  // changes (React's "reset state on prop change" pattern).
  const [hoveredId, setHoveredId] = useState(item.id);
  if (hoveredId !== item.id) {
    setHoveredId(item.id);
    setHovered(false);
  }
  const showChrome = process.env.EXPO_OS === 'web' && hovered;
  const label = item.year == null ? item.title : `${item.title} (${item.year})`;
  const providers = sources.map((id) => PROVIDERS[id].label).join(', ');
  const accessibilityLabel = [label, providers === '' ? null : `On ${providers}`, note].filter(Boolean).join('. ');

  // A gradient, not a solid bar: the caption only exists while the
  // pointer is on the poster, so it should fade out of the artwork rather than
  // cut a hard edge across it. Both text tones are the on-accent (always light)
  // foreground — `text-foreground` is near-black in the light theme and would
  // vanish into the scrim.
  const caption = showChrome ? (
    <View className="absolute bottom-0 left-0 right-0">
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.92)']}
        style={{
          bottom: 0,
          height: CAPTION_SCRIM_HEIGHT,
          left: 0,
          position: 'absolute',
          right: 0,
        }}
      />
      {/* `pr-8` keeps the caption clear of the provider dots, which
          stay put whether or not the pointer is on the poster. */}
      <View className="pl-2 pr-8 pb-1.5 pt-6">
        <Text
          className="text-accent-foreground font-sans-semibold text-xs leading-tight"
          numberOfLines={2}
        >
          {item.title}
        </Text>
        {item.year != null && (
          <Text className="text-accent-foreground/70 font-sans text-xs mt-0.5">
            {item.year}
          </Text>
        )}
      </View>
    </View>
  ) : note != null ? (
    <View className="absolute bottom-0 left-0 right-0">
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={{ bottom: 0, height: NOTE_SCRIM_HEIGHT, left: 0, position: 'absolute', right: 0 }}
      />
      <Text
        className="text-accent-foreground font-sans-semibold text-xs px-2 pb-1.5"
        numberOfLines={1}
      >
        {note}
      </Text>
    </View>
  ) : undefined;

  return (
    <View style={{ padding: GAP / 2 }}>
      <View
        className="w-full relative"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        style={{ aspectRatio: POSTER_ASPECT }}
      >
        <PresstableScale
          // The providers ride the poster's own label: the dots below are
          // decoration to a screen reader, and a wall of unlabelled artwork
          // must not become a wall of unlabelled artwork plus mystery dots.
          accessibilityLabel={accessibilityLabel}
          className="w-full h-full rounded-md overflow-hidden border border-border/40 bg-surface"
          onLongPress={() => onActions(item)}
          onPressIn={() => preloadRoute(routes.details(item.id, item.type))}
          onPress={() => {
            prefetchDetails(item);
            onPress(item);
          }}
        >
          <PosterFace
            // Always on, unlike the hover caption: "on both my trackers" versus
            // "only on Letterboxd" is the question this surface answers, and
            // a filtered row keeps all its marks.
            caption={caption}
            marks={sources}
            recyclingKey={item.id}
            uri={item.coverImage}
          />
        </PresstableScale>
        {watched != null && <WatchedMark item={item} poster showProgress={note == null} state={watched} />}
        {/* Sibling, not child: nesting two gesture-handler buttons would let a
            ⋯ press bubble into the poster press. Long-press covers native. */}
        {(process.env.EXPO_OS === 'web' || showActions) && (
          <OverlayActionsButton
            className="absolute top-0 right-0"
            label={`More options for ${item.title}`}
            onPress={() => onActions(item)}
            size="lg"
            tone="surface"
            visible={process.env.EXPO_OS !== 'web' || showChrome}
          />
        )}
      </View>
    </View>
  );
}

/**
 * The watchlist's poster wall: a dense, edge-to-edge grid of bare artwork.
 * Cells are a percentage of the list's real width (Legend List sizes columns
 * that way), so the wall fills whatever container it lands in — no fixed card
 * width leaving a ragged gutter on web — while the column *count* follows the
 * window.
 */
export function PosterWall({
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
  const { columns, rowHeight } = useWallMetrics();

  return (
    <List
      // Column count is baked into cell geometry — remount so no row keeps a
      // stale span after a rotation or window resize.
      key={`columns-${columns}`}
      className="flex-1"
      contentContainerStyle={{
        paddingHorizontal: EDGE_PAD - GAP / 2,
        paddingTop: GAP / 2,
        paddingBottom: showActions ? 96 : undefined,
      }}
      data={entries}
      extraData={watched}
      itemLayoutAnimation={itemLayoutAnimation}
      // Two rows ahead rather than the 250px default, which is barely one
      // poster row: a fast fling outran it and revealed rows filling in
      // late. Cheap now that the cells recycle.
      drawDistance={rowHeight * 2}
      estimatedItemSize={rowHeight}
      keyExtractor={(entry) => entry.id}
      numColumns={columns}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      // Recycled for the diary's reason (docs/solutions/diary-scroll-jank-is-row-mount-cost.md):
      // a cell is a gesture-handler pressable plus an image plus a gradient,
      // and mounting a screenful of them from scratch is what tears on a
      // fast scroll. Everything in a cell derives from the entry except the
      // web hover flag, which `PosterCell` resets when its item changes.
      recycleItems
      refreshControl={
        <RefreshControl onRefresh={onRefresh} />
      }
      // No `entering` on cells: a virtualized list mounts them again every
      // time they scroll back into view, so a mount animation replays on every
      // fast scroll (docs/solutions/entering-animation-on-virtualized-cells-replays.md).
      renderItem={({ item: entry }) => (
        <PosterCell
          item={entry.item}
          sources={entry.sources}
          onActions={onItemActions}
          onPress={onItemPress}
          watched={watched?.(entry.item)}
          showActions={showActions}
        />
      )}
      ListFooterComponent={footer}
    />
  );
}
