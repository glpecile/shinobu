import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

import { MediaCard } from './media-card';

interface MediaCarouselProps {
  title: string;
  /** The provider this row is sourced from — renders its brand mark. */
  provider?: ProviderId;
  items: NormalizedMediaItem[];
  onItemPress?: (item: NormalizedMediaItem) => void;
}

export function MediaCarousel({
  title,
  provider,
  items,
  onItemPress,
}: MediaCarouselProps) {
  const [collapsed, setCollapsed] = useState(false);
  const muted = useCSSVariable('--color-muted');

  if (items.length === 0) return null;

  return (
    <View className="mb-6">
      <PresstableOpacity
        accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
        accessibilityState={{ expanded: !collapsed }}
        className="flex-row items-center gap-2 self-start px-4 mb-3"
        onPress={() => setCollapsed(!collapsed)}
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
              <MediaCard item={item} onPress={onItemPress} />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
