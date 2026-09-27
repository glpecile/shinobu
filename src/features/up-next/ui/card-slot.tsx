import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import {
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
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
  onPress: (item: NormalizedMediaItem) => void;
  onActionsPress: (item: NormalizedMediaItem) => void;
}

/**
 * An `EpisodeCard` in a rail, carrying the row's exit and layout transitions.
 * No `entering`: the section rises in as one and a card must not perform on
 * load.
 */
export function CardSlot({
  group,
  badges,
  action,
  onPress,
  onActionsPress,
}: CardSlotProps) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatedView
      className="mr-3"
      exiting={CARD_EXIT}
      layout={reduceMotion ? undefined : CARD_LAYOUT}
    >
      <EpisodeCard
        action={action}
        badges={badges}
        group={group}
        onActionsPress={onActionsPress}
        onPress={onPress}
      />
    </AnimatedView>
  );
}
