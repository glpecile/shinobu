import Ionicons from '@react-native-vector-icons/ionicons/static';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableOpacity, PresstableScale } from '@/components/presstable';
import { useNewTabPress } from '@/components/use-new-tab-press';
import { routes } from '@/lib/routes';
import { useTraktMediaImages } from '@/state/queries/trakt';
import type { NormalizedMediaItem } from '@/types/media';

interface MediaCardProps {
  item: NormalizedMediaItem;
  /** Extra context line under the type label (e.g. a person's character/job). */
  subtitle?: string;
  onPress?: (item: NormalizedMediaItem) => void;
  /**
   * Opens the card actions dialog (quick log / hide). Triggered by long-press
   * everywhere and by a hover-revealed ⋯ button on web, where long-press
   * isn't a discoverable gesture.
   */
  onActionsPress?: (item: NormalizedMediaItem) => void;
}

function progressLabel(item: NormalizedMediaItem): string | null {
  if (item.currentProgress === 0) return null;
  const unit = item.progressUnit === 'chapter' ? 'ch' : 'ep';
  if (item.totalEpisodes != null && item.totalEpisodes > 0) {
    return `${item.currentProgress}/${item.totalEpisodes} ${unit}`;
  }
  return `${item.currentProgress} ${unit}`;
}

export function MediaCard({ item, subtitle, onPress, onActionsPress }: MediaCardProps) {
  const progress = progressLabel(item);
  // Watched-feed items arrive artless (Trakt dropped images from /sync/
  // watched/* in 2026) — this recovers the poster lazily, per visible card.
  const { coverImage } = useTraktMediaImages(item);
  const accentForeground = useCSSVariable('--color-accent-foreground');
  // JS hover state, not CSS: uniwind has no `group-hover:` support, so the
  // web-only ⋯ reveal rides on RN-web's pointer events instead.
  const [hovered, setHovered] = useState(false);
  const showActionsButton =
    onActionsPress != null && process.env.EXPO_OS === 'web' && hovered;

  // Web only: ⌘/Ctrl+click opens details in a new tab, like any other link.
  const newTab = useNewTabPress(routes.details(item.id));

  function onCardPress() {
    if (newTab.opened()) return;
    onPress?.(item);
  }

  return (
    // The ⋯ button is a *sibling* of the pressable, not a child — nesting two
    // gesture-handler buttons would let a ⋯ click bubble into the card press.
    <View
      className="w-40 h-60 relative"
      onPointerDown={newTab.onPointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <PresstableScale
        className="w-full h-full rounded-card overflow-hidden border border-border/50"
        onLongPress={
          onActionsPress == null ? undefined : () => onActionsPress(item)
        }
        onPress={onCardPress}
      >
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
          {subtitle != null && subtitle !== '' && (
            <Text className="text-muted text-xs font-sans mt-0.5" numberOfLines={1}>
              {subtitle}
            </Text>
          )}
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
              typeof accentForeground === 'string' ? accentForeground : undefined
            }
            name="ellipsis-horizontal"
            size={16}
          />
        </PresstableOpacity>
      )}
    </View>
  );
}
