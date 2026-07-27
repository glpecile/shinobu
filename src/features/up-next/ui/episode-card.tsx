import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Image } from '@/components/image';
import { MorphText } from '@/components/morph-text';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableScale } from '@/components/presstable';
import type { CardBadge } from '@/features/up-next/badges';
import { entryLabel } from '@/features/up-next/entry';
import type { UpNextEntry } from '@/features/up-next/types';
import type { NormalizedMediaItem } from '@/types/media';

import { Badge } from './badge';
import { useCardArt } from './use-card-art';

/**
 * The landscape Up Next card (plan 0019 U5) — art (see `useCardArt`), title,
 * the entry line (`entryLabel`: an episode code, or a film's release kind), a
 * badge slot over the art and an optional trailing action. Per-episode stills
 * are deferred follow-up work; the show backdrop stands in.
 */
interface EpisodeCardProps {
  entry: UpNextEntry;
  badges?: CardBadge[];
  /** Trailing action — the quick-log checkmark; Calendar cards have none. */
  action?: ReactNode;
  onPress?: (item: NormalizedMediaItem) => void;
  onActionsPress?: (item: NormalizedMediaItem) => void;
  /** Card width class; the agenda row overrides the carousel default. */
  className?: string;
}

export function EpisodeCard({
  entry,
  badges = [],
  action,
  onPress,
  onActionsPress,
  className = 'w-64',
}: EpisodeCardProps) {
  const art = useCardArt(entry.item);

  return (
    <View className={className}>
      <PresstableScale
        // The badges carry information that exists nowhere else on the card —
        // the air time above all — so they belong in the spoken label too.
        accessibilityLabel={[
          entry.item.title,
          entryLabel(entry),
          ...badges.map((badge) => badge.label),
        ].join(', ')}
        className="w-full h-36 rounded-card overflow-hidden border border-border/50"
        onLongPress={
          onActionsPress == null ? undefined : () => onActionsPress(entry.item)
        }
        onPress={() => onPress?.(entry.item)}
      >
        {art !== '' ? (
          <Image className="w-full h-full" contentFit="cover" source={{ uri: art }} />
        ) : (
          <PosterPlaceholder className="w-full h-full border-0" />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={{ bottom: 0, height: 72, left: 0, position: 'absolute', right: 0 }}
        />
        {badges.length > 0 && (
          <View className="absolute bottom-2 left-2 flex-row gap-1.5">
            {badges.map((badge) => (
              <Badge key={badge.label} label={badge.label} tone={badge.tone} />
            ))}
          </View>
        )}
      </PresstableScale>

      <View className="flex-row items-start justify-between gap-2 mt-2">
        <View className="flex-1">
          <Text
            className="text-foreground font-sans-semibold text-sm leading-tight"
            numberOfLines={1}
          >
            {entry.item.title}
          </Text>
          {/* Morphs in place when a quick-log advances this card to the next
              episode — the one text on screen that changes as a result of user
              state rather than navigation. */}
          <MorphText className="text-muted font-sans text-xs mt-0.5">
            {entryLabel(entry)}
          </MorphText>
        </View>
        {action}
      </View>
    </View>
  );
}
