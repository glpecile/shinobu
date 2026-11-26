import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Image } from '@/components/image';
import { MorphText } from '@/components/morph-text';
import { OverlayActionsButton } from '@/components/overlay-actions-button';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableScale } from '@/components/presstable';
import type { CardBadge } from '@/features/up-next/badges';
import { episodeHref } from '@/features/up-next/entry';
import { groupLabel, type UpNextGroup } from '@/features/up-next/group';
import { usePushRoute } from '@/lib/navigation';
import { usePrefetchMediaDetails } from '@/state/queries/media-details';
import type { NormalizedMediaItem } from '@/types/media';

import { Badge } from './badge';
import { useCardArt } from './use-card-art';
import { STACK_OFFSET } from './metrics';

interface EpisodeCardProps {
  group: UpNextGroup;
  badges?: CardBadge[];
  action?: ReactNode;
  onPress?: (item: NormalizedMediaItem) => void;
  onActionsPress?: (item: NormalizedMediaItem) => void;
  className?: string;
}

export function EpisodeCard({
  group,
  badges = [],
  action,
  onPress,
  onActionsPress,
  className = 'w-64',
}: EpisodeCardProps) {
  const { lead, entries } = group;
  const title = lead.item.title.trim() || 'Untitled';
  const pushRoute = usePushRoute();
  const prefetchDetails = usePrefetchMediaDetails();
  const art = useCardArt(lead.item);
  const label = groupLabel(group);
  const stacked = entries.length > 1;
  const href = stacked ? undefined : episodeHref(lead);
  const [hovered, setHovered] = useState(false);
  const showActionsButton = onActionsPress != null && process.env.EXPO_OS === 'web' && hovered;

  return (
    <View className={className}>
      <View
        className="w-full h-36"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <PresstableScale
          accessibilityLabel={[title, label, ...badges.map((badge) => badge.label)].join(', ')}
          className="w-full h-36"
          onLongPress={onActionsPress == null ? undefined : () => onActionsPress(lead.item)}
          onPress={() => {
            if (href == null) {
              onPress?.(lead.item);
              return;
            }
            prefetchDetails(lead.item);
            pushRoute(href);
          }}
        >
          {stacked && (
            <>
              <View
                className="absolute inset-0 rounded-lg border border-border/50 bg-surface opacity-30"
                style={{
                  transform: [{ translateX: STACK_OFFSET * 2 }, { translateY: -STACK_OFFSET * 2 }],
                }}
              />
              <View
                className="absolute inset-0 rounded-lg border border-border/50 bg-surface opacity-60"
                style={{
                  transform: [{ translateX: STACK_OFFSET }, { translateY: -STACK_OFFSET }],
                }}
              />
            </>
          )}

          <View className="w-full h-full rounded-lg overflow-hidden border border-border/50">
            <PosterPlaceholder className="w-full h-full border-0" />
            {art !== '' && (
              <Image
                className="absolute inset-0 w-full h-full"
                contentFit="cover"
                source={{ uri: art }}
              />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.85)']}
              style={{ bottom: 0, height: 72, left: 0, position: 'absolute', right: 0 }}
            />
            {badges.length > 0 && (
              <View className="absolute bottom-2 left-2 right-2 flex-row flex-wrap gap-1.5">
                {badges.map((badge) => (
                  <Badge key={badge.label} label={badge.label} tone={badge.tone} />
                ))}
              </View>
            )}
          </View>

          {stacked && !showActionsButton && (
            <View className="absolute top-2 right-2 rounded-full bg-black/70 border border-border/60 px-2 py-0.5">
              <Text className="text-accent-foreground font-sans-semibold text-xs">
                {entries.length}
              </Text>
            </View>
          )}
        </PresstableScale>
        {showActionsButton && (
          <OverlayActionsButton
            className="absolute top-2 right-2"
            label={`More options for ${title}`}
            onPress={() => onActionsPress(lead.item)}
            size="md"
          />
        )}
      </View>

      <View className="flex-row items-start justify-between gap-2 mt-2">
        <View className="flex-1 min-w-0">
          <Text
            className="text-foreground font-sans-semibold text-sm leading-tight"
            numberOfLines={1}
          >
            {title}
          </Text>
          <MorphText className="text-muted font-sans text-xs mt-0.5" numberOfLines={1}>
            {label}
          </MorphText>
        </View>
        {action}
      </View>
    </View>
  );
}
