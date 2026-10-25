import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import {
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

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
const CARD_LAYOUT =
  Platform.OS === 'ios' ? LinearTransition.duration(DURATION.swap) : undefined;

/**
 * Off-web, where an exit clone reparents the card out of the rail
 * (docs/solutions/reanimated-web-exiting-pulls-child-out-of-flow.md). Exported
 * for the block wrappers, whose exit has to outlive their last card's.
 */
export const CARD_EXIT =
  Platform.OS === 'web' ? undefined : FadeOut.duration(DURATION.exit);

interface CardSlotProps {
  group: UpNextGroup;
  badges?: CardBadge[];
  action?: ReactNode;
  /** Shared by the rail so remounted cards do not repeat their entrance. */
  arrival?: { id: string; seen: Set<string> };
  onPress: (item: NormalizedMediaItem) => void;
  onActionsPress: (item: NormalizedMediaItem) => void;
}

/**
 * An `EpisodeCard` in a rail, carrying the row's exit and layout transitions.
 * Only a new arrival rises in: on load the section rises in as one.
 */
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
