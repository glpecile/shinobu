import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Image } from '@/components/image';
import { MorphText } from '@/components/morph-text';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableScale } from '@/components/presstable';
import type { CardBadge } from '@/features/up-next/badges';
import { groupLabel, type UpNextGroup } from '@/features/up-next/group';
import type { NormalizedMediaItem } from '@/types/media';

import { Badge } from './badge';
import { useCardArt } from './use-card-art';

/**
 * The landscape Up Next card (plan 0019 U5) — art (see `useCardArt`), title,
 * the entry line (`groupLabel`: an episode code, a film's release kind, or a
 * batch's season and count), a badge slot over the art and an optional trailing
 * action. Per-episode stills are deferred follow-up work; the show backdrop
 * stands in.
 *
 * A group of more than one episode renders as a **stack**: two dimmed card
 * backs peeking out behind the face card, plus a count chip. Depth carries the
 * meaning — the row still reads as one slot per show, which is the whole point
 * of collapsing a season drop. The stack is not expandable; tapping it opens the
 * show, where the episodes already live.
 */
interface EpisodeCardProps {
  group: UpNextGroup;
  badges?: CardBadge[];
  /** Trailing action — the quick-log checkmark; Calendar cards have none. */
  action?: ReactNode;
  onPress?: (item: NormalizedMediaItem) => void;
  onActionsPress?: (item: NormalizedMediaItem) => void;
  /** Card width class; the agenda row overrides the carousel default. */
  className?: string;
}

/**
 * How far each card back peeks out, in px. Deliberately smaller than the row's
 * 12px inter-card gap so the far back never reaches into the neighbouring card;
 * the row reserves the matching space above itself so the stack isn't clipped.
 */
export const STACK_OFFSET = 5;

export function EpisodeCard({
  group,
  badges = [],
  action,
  onPress,
  onActionsPress,
  className = 'w-64',
}: EpisodeCardProps) {
  const { lead, entries } = group;
  const art = useCardArt(lead.item);
  const label = groupLabel(group);
  const stacked = entries.length > 1;

  return (
    <View className={className}>
      <PresstableScale
        // The badges carry information that exists nowhere else on the card —
        // the air time above all — so they belong in the spoken label too.
        accessibilityLabel={[
          lead.item.title,
          label,
          ...badges.map((badge) => badge.label),
        ].join(', ')}
        // No `overflow-hidden` here any more: the card backs sit *outside* this
        // box (up and to the right) and clipping them would erase the stack.
        // The art below keeps its own rounding and clipping instead.
        className="w-full h-36"
        onLongPress={
          onActionsPress == null ? undefined : () => onActionsPress(lead.item)
        }
        onPress={() => onPress?.(lead.item)}
      >
        {stacked && (
          // Drawn before the art so the art paints over them. Flat surface
          // fills rather than copies of the poster: they read as "more cards
          // behind this one", and repeating the artwork three times at three
          // opacities is the visual noise this whole change removes.
          <>
            <View
              className="absolute inset-0 rounded-card border border-border/50 bg-surface opacity-30"
              style={{
                transform: [
                  { translateX: STACK_OFFSET * 2 },
                  { translateY: -STACK_OFFSET * 2 },
                ],
              }}
            />
            <View
              className="absolute inset-0 rounded-card border border-border/50 bg-surface opacity-60"
              style={{
                transform: [
                  { translateX: STACK_OFFSET },
                  { translateY: -STACK_OFFSET },
                ],
              }}
            />
          </>
        )}

        <View className="w-full h-full rounded-card overflow-hidden border border-border/50">
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
        </View>

        {stacked && (
          // Sits on the face card's own corner rather than on the backs, so it
          // stays legible whatever the artwork behind it does. The count is
          // already in the label below and in the accessibility label, so this
          // is decoration for the eye, not the only place the number appears.
          <View className="absolute top-2 right-2 rounded-full bg-black/70 border border-border/60 px-2 py-0.5">
            <Text className="text-accent-foreground font-sans-semibold text-xs">
              {entries.length}
            </Text>
          </View>
        )}
      </PresstableScale>

      <View className="flex-row items-start justify-between gap-2 mt-2">
        <View className="flex-1">
          <Text
            className="text-foreground font-sans-semibold text-sm leading-tight"
            numberOfLines={1}
          >
            {lead.item.title}
          </Text>
          {/* Morphs in place when a quick-log advances this card to the next
              episode — the one text on screen that changes as a result of user
              state rather than navigation. */}
          <MorphText className="text-muted font-sans text-xs mt-0.5">
            {label}
          </MorphText>
        </View>
        {action}
      </View>
    </View>
  );
}
