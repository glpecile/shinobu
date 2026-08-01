import Ionicons from '@react-native-vector-icons/ionicons/static';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { RefreshControl, Text, useWindowDimensions, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Image } from '@/components/image';
import { List } from '@/components/List';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableOpacity, PresstableScale } from '@/components/presstable';
import { PROVIDER_DOT } from '@/features/trackers/provider-style';
import { cn } from '@/lib/cn';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

import type { WatchlistEntry, WatchlistLayoutProps } from './types';

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
/** Short fade behind the always-on provider dots — enough to read them on
 *  bright artwork, shallow enough not to read as a caption bar. */
const MARK_SCRIM_HEIGHT = 34;
/** Past this the artwork is too small to recognize, however wide the display. */
const MAX_COLUMNS = 8;

function useWallMetrics(): { columns: number; rowHeight: number } {
  const { width } = useWindowDimensions();
  const usable = width - 2 * EDGE_PAD;
  const columns = Math.min(
    MAX_COLUMNS,
    Math.max(MIN_COLUMNS, Math.floor(usable / TARGET_COLUMN_PITCH)),
  );
  // Only feeds `estimatedItemSize`: the real cells are percentage-width (see
  // PosterCell), so on web the sidebar makes this run a little tall — fine for
  // an estimate the list corrects on first measure, wrong as a layout input.
  const posterWidth = (usable - GAP * (columns - 1)) / columns;
  return { columns, rowHeight: posterWidth / POSTER_ASPECT + GAP };
}

/**
 * The brand dots for the providers holding this film, bottom-right over a
 * short fade (owner, 2026-08-01). Always on, unlike the hover caption: the
 * wall used to be bare artwork because a Letterboxd-only grid had nothing to
 * say about provenance, and a merged one does — "on both my trackers" versus
 * "only on Letterboxd" is the question this surface exists to answer, and it
 * survives the provider filter (a filtered row keeps all its marks).
 *
 * Dots rather than the brand icons the diary rows use: at this size a logo is
 * mush, and a dot with a dark ring reads on any artwork.
 */
function PosterMarks({ sources }: { sources: readonly ProviderId[] }) {
  return (
    <View
      accessibilityLabel={`On ${sources.map((id) => PROVIDERS[id].label).join(', ')}`}
      className="absolute bottom-1.5 right-1.5 flex-row gap-1"
    >
      {sources.map((id) => (
        <View
          className={cn(
            'w-[7px] h-[7px] rounded-full border border-black/40',
            PROVIDER_DOT[id],
          )}
          key={id}
        />
      ))}
    </View>
  );
}

/**
 * One poster. No type label at rest: on a watchlist "MOVIE" on every card is
 * noise, and the artwork already carries its own title, so burning ours over
 * it buys nothing. The title stays reachable through `accessibilityLabel`
 * everywhere and a hover caption on web. The provider dots are the one piece
 * of chrome that *is* always on — see `PosterMarks`.
 */
function PosterCell({
  entry,
  onPress,
  onActions,
}: {
  entry: WatchlistEntry;
  onPress: (item: NormalizedMediaItem) => void;
  onActions: (item: NormalizedMediaItem) => void;
}) {
  const item = entry.item;
  const foreground = useCSSVariable('--color-foreground');
  // JS hover state, not CSS: uniwind has no `group-hover:`, so the web-only
  // reveal rides on RN-web's pointer events (same approach as MediaCard).
  const [hovered, setHovered] = useState(false);
  const showChrome = process.env.EXPO_OS === 'web' && hovered;
  const label = item.year == null ? item.title : `${item.title} (${item.year})`;
  const providers = entry.sources.map((id) => PROVIDERS[id].label).join(', ');

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
          accessibilityLabel={`${label}. On ${providers}`}
          className="w-full h-full rounded-md overflow-hidden border border-border/40 bg-surface"
          onLongPress={() => onActions(item)}
          onPress={() => onPress(item)}
        >
          {item.coverImage !== '' ? (
            <Image
              source={{ uri: item.coverImage }}
              className="w-full h-full"
              contentFit="cover"
              recyclingKey={item.id}
            />
          ) : (
            <PosterPlaceholder className="w-full h-full border-0" />
          )}
          {/* The dots' own fade — skipped while the caption is up, whose
              taller scrim already covers this band. */}
          {!showChrome && (
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.72)']}
              style={{
                bottom: 0,
                height: MARK_SCRIM_HEIGHT,
                left: 0,
                position: 'absolute',
                right: 0,
              }}
            />
          )}
          {showChrome && (
            // A gradient, not a solid bar: the caption only exists while the
            // pointer is on the poster, so it should fade out of the artwork
            // rather than cut a hard edge across it. Both text tones are the
            // on-accent (always light) foreground — `text-foreground` is
            // near-black in the light theme and would vanish into the scrim.
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
          )}
          <PosterMarks sources={entry.sources} />
        </PresstableScale>
        {/* Sibling, not child: nesting two gesture-handler buttons would let a
            ⋯ press bubble into the poster press. Long-press covers native. */}
        {showChrome && (
          <PresstableOpacity
            accessibilityLabel={`More options for ${item.title}`}
            className="absolute top-1.5 right-1.5 w-7 h-7 items-center justify-center rounded-full bg-surface/95 border border-border/40"
            onPress={() => onActions(item)}
          >
            <Ionicons
              color={typeof foreground === 'string' ? foreground : undefined}
              name="ellipsis-horizontal"
              size={14}
            />
          </PresstableOpacity>
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
  refreshing,
  onRefresh,
  onEndReached,
  footer,
}: WatchlistLayoutProps) {
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
      }}
      data={entries}
      estimatedItemSize={rowHeight}
      keyExtractor={(entry) => entry.id}
      numColumns={columns}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      refreshControl={
        <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
      }
      renderItem={({ item: entry }) => (
        <PosterCell
          entry={entry}
          onActions={onItemActions}
          onPress={onItemPress}
        />
      )}
      ListFooterComponent={footer}
    />
  );
}
