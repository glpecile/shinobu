import { ScrollView, Text, View } from 'react-native';

import type { NormalizedMediaItem } from '@/types/media';

import { MediaCard } from './media-card';

interface MediaCarouselProps {
  title: string;
  items: NormalizedMediaItem[];
  onItemPress?: (item: NormalizedMediaItem) => void;
}

export function MediaCarousel({
  title,
  items,
  onItemPress,
}: MediaCarouselProps) {
  if (items.length === 0) return null;

  return (
    <View className="mb-6">
      <Text className="text-xl font-display text-foreground px-4 mb-3">
        {title}
      </Text>
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
    </View>
  );
}
