import type { ReactNode } from 'react';
import { View } from 'react-native';

import { CollapsibleSection } from '@/components/collapsible-section';
import { VirtualizedRail } from '@/components/rail';
import { SectionEnter, useArrivalHistory } from '@/components/section-enter';
import { ViewAllLink } from '@/components/view-all-link';
import type { NormalizedMediaItem } from '@/types/media';

import { MediaCard } from './media-card';

const CARD_WIDTH = 160;
const CARD_HEIGHT = 240;
const CARD_GAP = 12;
const EDGE_GUTTER = 16;

interface MediaCarouselProps {
  title: string;
  /** Stable key for persisted collapse state — do not derive from `title`. */
  collapseKey: string;
  leading?: ReactNode;
  items: readonly NormalizedMediaItem[];
  subtitles?: Record<string, string>;
  onItemActions: (item: NormalizedMediaItem) => void;
  onViewAll?: () => void;
}

export function MediaCarousel({
  title,
  collapseKey,
  leading,
  items,
  subtitles,
  onItemActions,
  onViewAll,
}: MediaCarouselProps) {
  const arrivalHistory = useArrivalHistory(items.map((item) => item.id));

  if (items.length === 0) return null;

  return (
    <CollapsibleSection
      collapseKey={collapseKey}
      leading={leading}
      title={title}
      action={onViewAll != null && <ViewAllLink onPress={onViewAll} title={title} />}
    >
      <VirtualizedRail
        data={items}
        estimatedItemSize={CARD_WIDTH + CARD_GAP}
        keyExtractor={(item) => item.id}
        // Legend List drops horizontal `contentContainerStyle` padding on web
        // (docs/solutions/legend-list-horizontal-content-padding-web.md).
        ListHeaderComponent={<View style={{ width: EDGE_GUTTER }} />}
        ListFooterComponent={<View style={{ width: EDGE_GUTTER - CARD_GAP }} />}
        renderItem={({ item }) => {
          const card = (
            <MediaCard
              item={item}
              onActionsPress={onItemActions}
              subtitle={subtitles?.[item.id]}
            />
          );
          return (
            <View className="mr-3">
              <SectionEnter arrival={{ id: item.id, seen: arrivalHistory }}>{card}</SectionEnter>
            </View>
          );
        }}
        style={{ height: CARD_HEIGHT }}
      />
    </CollapsibleSection>
  );
}
