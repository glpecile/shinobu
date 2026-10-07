import { View } from 'react-native';

import { CollapsibleSection } from '@/components/collapsible-section';
import { List } from '@/components/List';
import { ProviderIcon } from '@/components/provider-icon';
import { useRailFade } from '@/components/rail';
import { ViewAllLink } from '@/components/view-all-link';
import type { ProviderId } from '@/lib/providers/types';
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
  const { scrollProps, fade } = useRailFade();

  if (items.length === 0) return null;

  return (
    <CollapsibleSection
      collapseKey={collapseKey}
      leading={provider != null ? <ProviderIcon id={provider} size={16} /> : undefined}
      title={title}
      action={onViewAll != null && <ViewAllLink onPress={onViewAll} title={title} />}
    >
      <View>
        {/* Virtualized, not `ScrollView` + `map` (AGENTS.md "Long Lists"): a
            mapped row mounts every card at once, and each `MediaCard` fires its
            own poster request — the Your Shows row turned that into an app-wide
            stall (plan 0024 U7). `recycleItems` stays off: `MediaCard` keeps
            local `hovered` state, which would leak across recycled cells. */}
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
          {...scrollProps}
        />
        {fade}
      </View>
    </CollapsibleSection>
  );
}
