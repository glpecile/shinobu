import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useWindowDimensions } from '@/lib/window-dimensions';

import { List } from '@/components/List';
import { OverlayActionsButton } from '@/components/overlay-actions-button';
import { PosterFace } from '@/components/poster-face';
import { PresstableScale } from '@/components/presstable';
import { RefreshControl } from '@/components/refresh-control';
import { WatchedMark } from '@/components/watched-mark';
import type { MediaProgress } from '@/lib/media-progress';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { usePrefetchMediaDetails } from '@/state/queries/media-details';
import type { NormalizedMediaItem } from '@/types/media';

import type { MediaLayoutProps } from './types';

const POSTER_ASPECT = 2 / 3;
const GAP = 8;
const EDGE_PAD = 12;
const TARGET_COLUMN_PITCH = 132;
const MIN_COLUMNS = 3;
const CAPTION_SCRIM_HEIGHT = 96;
const NOTE_SCRIM_HEIGHT = 48;
const MAX_COLUMNS = 8;
const NO_SOURCES: readonly ProviderId[] = [];
const WEB_SIDEBAR_WIDTH = 241;

export function useWallMetrics(): { columns: number; rowHeight: number } {
  const { width } = useWindowDimensions();
  const usable = width - 2 * EDGE_PAD;
  const columns = Math.min(
    MAX_COLUMNS,
    Math.max(MIN_COLUMNS, Math.floor(usable / TARGET_COLUMN_PITCH)),
  );
  // Legend List under-allocates containers if estimatedItemSize is taller than real rows, so subtract the expanded web sidebar.
  const contentWidth =
    process.env.EXPO_OS === 'web' && width >= 768 ? usable - WEB_SIDEBAR_WIDTH : usable;
  const posterWidth = (contentWidth - GAP * (columns - 1)) / columns;
  return { columns, rowHeight: posterWidth / POSTER_ASPECT + GAP };
}

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
  sources?: readonly ProviderId[];
  onPress: (item: NormalizedMediaItem) => void;
  onActions: (item: NormalizedMediaItem) => void;
  watched?: MediaProgress;
  showActions?: boolean;
  note?: string;
}) {
  const prefetchDetails = usePrefetchMediaDetails();
  // Uniwind has no group-hover:, so web hover uses RN-web pointer events.
  const [hovered, setHovered] = useState(false);
  const [hoveredId, setHoveredId] = useState(item.id);
  if (hoveredId !== item.id) {
    setHoveredId(item.id);
    setHovered(false);
  }
  const showChrome = process.env.EXPO_OS === 'web' && hovered;
  const label = item.year == null ? item.title : `${item.title} (${item.year})`;
  const providers = sources.map((id) => PROVIDERS[id].label).join(', ');
  const accessibilityLabel = [label, providers === '' ? null : `On ${providers}`, note]
    .filter(Boolean)
    .join('. ');

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
      <View className="pl-2 pr-8 pb-1.5 pt-6">
        <Text
          className="text-accent-foreground font-sans-semibold text-xs leading-tight"
          numberOfLines={2}
        >
          {item.title}
        </Text>
        {item.year != null && (
          <Text className="text-accent-foreground/70 font-sans text-xs mt-0.5">{item.year}</Text>
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
          accessibilityLabel={accessibilityLabel}
          className="w-full h-full rounded-lg overflow-hidden border border-border/50 bg-surface"
          onLongPress={() => onActions(item)}
          onPress={() => {
            prefetchDetails(item);
            onPress(item);
          }}
        >
          <PosterFace
            caption={caption}
            marks={sources}
            recyclingKey={item.id}
            uri={item.coverImage}
          />
        </PresstableScale>
        {watched != null && (
          <WatchedMark item={item} poster showProgress={note == null} state={watched} />
        )}
        {/* Sibling, not child: nested gesture-handler buttons bubble presses into the poster. */}
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
      drawDistance={rowHeight * 2}
      estimatedItemSize={rowHeight}
      keyExtractor={(entry) => entry.id}
      numColumns={columns}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      // docs/solutions/diary-scroll-jank-is-row-mount-cost.md
      recycleItems
      refreshControl={<RefreshControl onRefresh={onRefresh} />}
      // No entering animation on virtualized cells (docs/solutions/entering-animation-on-virtualized-cells-replays.md).
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
