import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { SectionEnter } from '@/components/section-enter';
import type { CardBadge } from '@/features/up-next/badges';
import type { UpNextGroup } from '@/features/up-next/group';
import { DURATION } from '@/lib/motion';
import type { NormalizedMediaItem } from '@/types/media';

import { EpisodeCard } from './episode-card';

/**
 * iOS only. Android strands the neighbours mid-travel
 * (docs/solutions/android-layout-transition-strands-carousel-cards.md); on web
 * a `layout` transition scales the card's text
 * (docs/solutions/reanimated-web-layout-transition-scales-text.md).
 */
const CARD_LAYOUT = Platform.OS === 'ios' ? LinearTransition.duration(DURATION.swap) : undefined;

/**
 * Skip the exit fade on web, where Reanimated pulls the card out of the rail's flow
 * (docs/solutions/reanimated-web-exiting-pulls-child-out-of-flow.md).
 */
export const CARD_EXIT = Platform.OS === 'web' ? undefined : FadeOut.duration(DURATION.exit);

interface CardSlotProps {
  group: UpNextGroup;
  badges?: CardBadge[];
  action?: ReactNode;
  arrival?: { id: string; seen: Set<string> };
  onPress: (item: NormalizedMediaItem) => void;
  onActionsPress: (item: NormalizedMediaItem) => void;
}

export function CardSlot({
  group,
  badges,
  action,
  arrival,
  onPress,
  onActionsPress,
}: CardSlotProps) {
  const reduceMotion = useReducedMotion();
  const card = (
    <EpisodeCard
      action={action}
      badges={badges}
      group={group}
      onActionsPress={onActionsPress}
      onPress={onPress}
    />
  );

  return (
    <AnimatedView
      className="mr-3"
      exiting={CARD_EXIT}
      layout={reduceMotion ? undefined : CARD_LAYOUT}
    >
      {arrival == null ? card : <SectionEnter arrival={arrival}>{card}</SectionEnter>}
    </AnimatedView>
  );
}
