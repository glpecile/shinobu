import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { VirtualizedRail } from '@/components/rail';
import type { CardBadge } from '@/features/up-next/badges';
import type { UpNextGroup } from '@/features/up-next/group';
import type { NormalizedMediaItem } from '@/types/media';

import { CardSlot } from './card-slot';
import { episodeCardRailHeight, STACK_OFFSET } from './metrics';

// Stacked card backs sit `STACK_OFFSET * 2` above the face card; a horizontal
// scroll view clips at its own frame. Paid whether or not a stack is present,
// so a season drop doesn't push every card down.
export const STACK_HEADROOM = STACK_OFFSET * 2;

/**
 * A virtualized row of Up Next cards, one per group, keyed per show so a
 * quick-log advance updates the card in place. Continue Watching, This Week's
 * day and Coming Soon differ only in what each card says and carries.
 */
export function EpisodeCardRail({ groups, stacked = false, badges, action, arrival, onPress, onActionsPress }: {
  groups: readonly UpNextGroup[];
  /** Reserve headroom for a stacked group's card backs. */
  stacked?: boolean;
  badges: (group: UpNextGroup) => CardBadge[];
  action?: (group: UpNextGroup) => ReactNode;
  arrival?: (group: UpNextGroup) => { id: string; seen: Set<string> } | undefined;
  onPress: (item: NormalizedMediaItem) => void;
  onActionsPress: (item: NormalizedMediaItem) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const headroom = stacked ? STACK_HEADROOM : 0;
  return (
    <VirtualizedRail
      // Horizontal Legend List padding does not offset items on web. Spacers
      // match the header's px-4; CardSlot already adds mr-3.
      // See docs/solutions/legend-list-horizontal-content-padding-web.md.
      ListHeaderComponent={<View className="w-4" />}
      ListFooterComponent={<View className="w-1" />}
      contentContainerStyle={stacked ? { paddingTop: headroom } : undefined}
      data={groups}
      estimatedItemSize={268}
      keyExtractor={(group) => group.id}
      style={{ height: episodeCardRailHeight(fontScale, headroom) }}
      renderItem={({ item: group }) => (
        <CardSlot
          action={action?.(group)}
          arrival={arrival?.(group)}
          badges={badges(group)}
          group={group}
          onActionsPress={onActionsPress}
          onPress={onPress}
        />
      )}
    />
  );
}
