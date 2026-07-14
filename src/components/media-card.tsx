import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { Image } from '@/components/image';
import { PresstableScale } from '@/components/presstable';
import { useTraktMediaImages } from '@/state/queries/trakt';
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
  // Watched-feed items arrive artless (Trakt dropped images from /sync/
  // watched/* in 2026) — this recovers the poster lazily, per visible card.
  const { coverImage } = useTraktMediaImages(item);

  return (
    <PresstableScale
      className="w-40 h-60 rounded-card overflow-hidden border border-border/50"
      onPress={() => onPress?.(item)}
    >
      <Image
        source={{ uri: coverImage }}
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
    </PresstableScale>
  );
}
