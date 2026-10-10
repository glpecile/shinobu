import Ionicons from '@react-native-vector-icons/ionicons/static';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableOpacity, PresstableScale } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { useNewTabPress } from '@/components/use-new-tab-press';
import { cn } from '@/lib/cn';
import { sourceProviderOf } from '@/lib/providers/provider-links';
import { PROVIDERS } from '@/lib/providers/registry';
import { routes } from '@/lib/routes';
import { useThemeColor } from '@/lib/theme-color';
import { useTraktMediaImages } from '@/state/queries/trakt';
import type { NormalizedMediaItem } from '@/types/media';

interface MediaCardProps {
  item: NormalizedMediaItem;
  /** Layout only, including responsive poster dimensions. */
  className?: string;
  /** Extra context line under the type label (e.g. a person's character/job). */
  subtitle?: string;
  onPress?: (item: NormalizedMediaItem) => void;
  /** Opens quick log/hide via long-press or the web hover button. */
  onActionsPress: (item: NormalizedMediaItem) => void;
}

function progressLabel(item: NormalizedMediaItem): string | null {
  if (item.currentProgress === 0) return null;
  const unit = item.progressUnit === 'chapter' ? 'ch' : 'ep';
  if (item.totalEpisodes != null && item.totalEpisodes > 0) {
    return `${item.currentProgress}/${item.totalEpisodes} ${unit}`;
  }
  return `${item.currentProgress} ${unit}`;
}

export function MediaCard({ item, className, subtitle, onPress, onActionsPress }: MediaCardProps) {
  const progress = progressLabel(item);
  const source = sourceProviderOf(item) ?? (item.id.startsWith('tmdb-') ? 'tmdb' : null);
  const sourceLabel = source == null ? null : source === 'tmdb' ? 'TMDB' : PROVIDERS[source].label;
  // Trakt's watched feed omits artwork; fetch it for visible cards.
  const { coverImage } = useTraktMediaImages(item);
  const accentForeground = useThemeColor('--color-accent-foreground');
  // Uniwind has no group-hover support.
  const [hovered, setHovered] = useState(false);
  const showActionsButton = process.env.EXPO_OS === 'web' && hovered;

  const newTab = useNewTabPress(routes.details(item.id, item.type));

  function onCardPress() {
    if (newTab.opened()) return;
    onPress?.(item);
  }

  return (
    // Keep the actions button separate so its press cannot open details.
    <View
      className={cn('w-40 h-60 relative', className)}
      onPointerDown={newTab.onPointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <PresstableScale
        accessibilityLabel={[item.title, item.type, progress, subtitle, sourceLabel].filter(Boolean).join(' · ')}
        accessibilityRole="button"
        className="w-full h-full"
        onLongPress={() => onActionsPress(item)}
        onPress={onCardPress}
      >
        <View className="w-full h-full rounded-lg overflow-hidden border border-border/50">
          {coverImage !== '' ? (
            <Image
              source={{ uri: coverImage }}
              className="w-full h-full"
              contentFit="cover"
            />
          ) : (
            <PosterPlaceholder className="w-full h-full border-0" />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 112 }}
          />
          {/* Keep text light over the dark scrim in both themes. */}
          <View className="absolute bottom-0 left-0 right-0 p-3">
            <Text
              className="text-accent-foreground font-sans-semibold text-sm leading-tight"
              numberOfLines={2}
            >
              {item.title}
            </Text>
            <View className="flex-row items-center mt-1.5">
              <Text className="text-accent-foreground/70 text-xs font-sans flex-1" numberOfLines={1}>
                {item.type}{progress != null ? ` · ${progress}` : ''}
              </Text>
              {source != null && <View className="ml-2"><ProviderIcon id={source} size={12} /></View>}
            </View>
            {subtitle != null && subtitle !== '' && (
              <Text
                className="text-accent-foreground/70 text-xs font-sans mt-0.5"
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            )}
          </View>
        </View>
      </PresstableScale>
      {showActionsButton && (
        <PresstableOpacity
          accessibilityLabel={`More options for ${item.title}`}
          className="absolute top-2 right-2 w-8 h-8 items-center justify-center rounded-full bg-black/60"
          onPress={() => onActionsPress(item)}
        >
          <Ionicons
            color={
              accentForeground
            }
            name="ellipsis-horizontal"
            size={16}
          />
        </PresstableOpacity>
      )}
    </View>
  );
}
