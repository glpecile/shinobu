import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { AnimatedView } from '@/components/animated-view';
import { List } from '@/components/List';
import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import type { ProviderId } from '@/lib/providers/types';
import {
  setSectionCollapsed,
  useSectionCollapsed,
} from '@/state/prefs/collapsed-sections';
import type { NormalizedMediaItem } from '@/types/media';

import { MediaCard } from './media-card';

/**
 * `MediaCard`'s own box (`w-40 h-60`) plus the `mr-3` gutter, in px. A
 * virtualized horizontal list can't measure its children before they mount, so
 * it needs both: the height to size the row inside the screen's vertical
 * scroll view, and the item size to estimate how far the content extends.
 */
const CARD_WIDTH = 160;
const CARD_HEIGHT = 240;
const CARD_GAP = 12;
/** Matches the section header's `px-4`, so a row starts under its own title. */
const EDGE_GUTTER = 16;

interface MediaCarouselProps {
  title: string;
  /**
   * Stable identity for the persisted collapse preference — never derive it
   * from `title`, which can change (the seasonal anime row is renamed every
   * cour and must keep its collapse state).
   */
  collapseKey: string;
  /** The provider this row is sourced from — renders its brand mark. */
  provider?: ProviderId;
  items: readonly NormalizedMediaItem[];
  /** Per-item context line under the type label (see MediaCard's `subtitle`). */
  subtitles?: Record<string, string>;
  onItemPress?: (item: NormalizedMediaItem) => void;
  /** Opens the card actions dialog — see MediaCard's `onActionsPress`. */
  onItemActions?: (item: NormalizedMediaItem) => void;
  /**
   * Opt-in "View all" link beside the title, for rows whose source has more
   * than the row shows (the Letterboxd watchlist's paginated grid). Hidden
   * while the row is collapsed — there's nothing to lead out of.
   */
  onViewAll?: () => void;
}

export function MediaCarousel({
  title,
  collapseKey,
  provider,
  items,
  subtitles,
  onItemPress,
  onItemActions,
  onViewAll,
}: MediaCarouselProps) {
  const collapsed = useSectionCollapsed(collapseKey);
  const muted = useCSSVariable('--color-muted');
  const accent = useCSSVariable('--color-accent');
  // JS hover state, not CSS: uniwind has no `group-hover:`, so the pointer
  // events drive a Reanimated CSS transition instead (same approach as
  // `MediaCard`'s web-only ⋯ reveal).
  const [viewAllHovered, setViewAllHovered] = useState(false);

  if (items.length === 0) return null;

  return (
    <View className="mb-6">
      <View className="flex-row items-center justify-between px-4 mb-3">
        <PresstableOpacity
          accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
          accessibilityState={{ expanded: !collapsed }}
          className="flex-row items-center gap-2"
          onPress={() => setSectionCollapsed(collapseKey, !collapsed)}
        >
          {provider != null && <ProviderIcon id={provider} size={16} />}
          <Text className="text-xl font-display text-foreground">{title}</Text>
          <Ionicons
            color={typeof muted === 'string' ? muted : undefined}
            name={collapsed ? 'chevron-down' : 'chevron-up'}
            size={18}
          />
        </PresstableOpacity>
        {/* Sibling of the collapse toggle, never nested inside it — two
            gesture-handler buttons in one tree would double-fire the tap. */}
        {onViewAll != null && !collapsed && (
          // Hover lives on a plain wrapper: pressto's pressables take
          // gesture-handler props, not RN-web pointer ones.
          <View
            onPointerEnter={() => setViewAllHovered(true)}
            onPointerLeave={() => setViewAllHovered(false)}
          >
            <PresstableOpacity
              accessibilityLabel={`View all in ${title}`}
              className="flex-row items-center gap-1"
              onPress={onViewAll}
            >
              <Text className="text-accent font-sans-semibold text-sm">
                View all
              </Text>
              {/* Only the chevron travels — the label stays anchored, so the
                  arrow reads as pointing onward rather than the whole control
                  drifting. Accent, not muted: a grey arrow after red text read
                  as two separate things. The nudge is a Reanimated CSS
                  transition (the same declarative style the floating tiles
                  use), so native simply never triggers it. */}
              <AnimatedView
                style={{
                  transform: [{ translateX: viewAllHovered ? 3 : 0 }],
                  transitionProperty: 'transform',
                  transitionDuration: 160,
                  transitionTimingFunction: 'ease-out',
                }}
              >
                <Ionicons
                  color={typeof accent === 'string' ? accent : undefined}
                  name="chevron-forward"
                  size={14}
                />
              </AnimatedView>
            </PresstableOpacity>
          </View>
        )}
      </View>
      {!collapsed && (
        // Virtualized, not `ScrollView` + `map` (AGENTS.md "Long Lists"): a
        // mapped row mounts every card at once, and each `MediaCard` fires its
        // own poster request — the Your Shows row turned that into an app-wide
        // stall (plan 0024 U7). `recycleItems` stays off: `MediaCard` keeps
        // local `hovered` state, which would leak across recycled cells.
        <List
          data={items}
          estimatedItemSize={CARD_WIDTH + CARD_GAP}
          horizontal
          keyExtractor={(item) => item.id}
          // Spacer elements, not `contentContainerStyle` padding: Legend List
          // drops that on web for *horizontal* lists (vertical ones honor it),
          // which left the rows butted against the sidebar and bleeding off the
          // right edge while their section headers stayed inset
          // (docs/solutions/legend-list-horizontal-content-padding-web.md).
          // The trailing spacer is short by one gutter — every card already
          // carries `mr-3`.
          ListHeaderComponent={<View style={{ width: EDGE_GUTTER }} />}
          ListFooterComponent={<View style={{ width: EDGE_GUTTER - CARD_GAP }} />}
          renderItem={({ item }) => (
            <View className="mr-3">
              <MediaCard
                item={item}
                onActionsPress={onItemActions}
                onPress={onItemPress}
                subtitle={subtitles?.[item.id]}
              />
            </View>
          )}
          showsHorizontalScrollIndicator={false}
          style={{ height: CARD_HEIGHT }}
        />
      )}
    </View>
  );
}
