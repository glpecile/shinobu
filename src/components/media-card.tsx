import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';

import type { NormalizedMediaItem } from '@/types/media';

interface MediaCardProps {
  item: NormalizedMediaItem;
  onPress?: (item: NormalizedMediaItem) => void;
}

function progressLabel(item: NormalizedMediaItem): string | null {
  if (item.currentProgress === 0) return null;
  if (item.type === 'MANGA') return `${item.currentProgress} ch`;
  return `${item.currentProgress} ep`;
}

export function MediaCard({ item, onPress }: MediaCardProps) {
  const progress = progressLabel(item);

  return (
    <Pressable
      className="w-40 h-60 rounded-card overflow-hidden border border-border/50 active:opacity-80"
      onPress={() => onPress?.(item)}
    >
      <Image
        source={{ uri: item.coverImage }}
        className="w-full h-full"
        contentFit="cover"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 112 }}
      />
      <View className="absolute bottom-0 left-0 right-0 p-3">
        <Text
          className="text-foreground font-sans-semibold text-sm leading-tight"
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <View className="flex-row justify-between items-center mt-1.5">
          <Text className="text-accent text-xs font-sans-semibold uppercase tracking-wider">
            {item.type}
          </Text>
          {progress != null && (
            <Text className="text-muted text-xs font-sans">{progress}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}
