import Ionicons from '@react-native-vector-icons/ionicons/static';
import { ScrollView, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import type { ProviderId } from '@/lib/providers/types';
import {
  setSectionCollapsed,
  useSectionCollapsed,
} from '@/state/prefs/collapsed-sections';
import type { NormalizedMediaItem } from '@/types/media';

import { MediaCard } from './media-card';

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
  items: NormalizedMediaItem[];
  /** Per-item context line under the type label (see MediaCard's `subtitle`). */
  subtitles?: Record<string, string>;
  onItemPress?: (item: NormalizedMediaItem) => void;
  /** Opens the card actions dialog — see MediaCard's `onActionsPress`. */
  onItemActions?: (item: NormalizedMediaItem) => void;
}

export function MediaCarousel({
  title,
  collapseKey,
  provider,
  items,
  subtitles,
  onItemPress,
  onItemActions,
}: MediaCarouselProps) {
  const collapsed = useSectionCollapsed(collapseKey);
  const muted = useCSSVariable('--color-muted');

  if (items.length === 0) return null;

  return (
    <View className="mb-6">
      <PresstableOpacity
        accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
        accessibilityState={{ expanded: !collapsed }}
        className="flex-row items-center gap-2 self-start px-4 mb-3"
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
      {!collapsed && (
        <ScrollView
          horizontal
          className="px-4"
          showsHorizontalScrollIndicator={false}
        >
          {items.map((item) => (
            <View key={item.id} className="mr-3">
              <MediaCard
                item={item}
                onActionsPress={onItemActions}
                onPress={onItemPress}
                subtitle={subtitles?.[item.id]}
              />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
