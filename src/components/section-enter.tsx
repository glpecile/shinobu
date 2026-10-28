import { useState, type ReactNode } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { DURATION, EASE_OUT } from '@/lib/motion';

/** Tiny: whatever it replaces occupied the same box. */
const SECTION_RISE = 6;

const sectionEntering = {
  '0%': { opacity: 0, transform: [{ translateY: SECTION_RISE }] },
  '100%': { opacity: 1, transform: [{ translateY: 0 }] },
};

/** Reduced motion keeps the fade and drops the travel. */
const sectionFading = {
  '0%': { opacity: 0 },
  '100%': { opacity: 1 },
};

/**
 * Holds the first frame inside the animation timeline so staggered entrances
 * stay hidden until their turn, without relying on a backwards fill.
 */
export function heldKeyframes<Frame>(
  keyframes: { '0%': Frame; '100%': Frame },
  delay: number,
  duration: number,
) {
  if (delay === 0) return keyframes;
  return {
    '0%': keyframes['0%'],
    [`${(delay / (delay + duration)) * 100}%`]: keyframes['0%'],
    '100%': keyframes['100%'],
  };
}

/**
 * Fades and settles its children in on mount — what a section resolving looks
 * like instead of a hard cut. `SuspenseSection` mounts it when its query
 * resolves; a screen switching between mutually exclusive states (skeleton,
 * results, empty) mounts it with a `key` per state.
 *
 * A CSS animation rather than an `entering=` layout animation: the wrapper has
 * to contribute its height to the scroll view's flow on web, which a layout
 * animation pins.
 */
export function SectionEnter({
  children,
  className,
  arrival,
}: {
  children: ReactNode;
  className?: string;
  arrival?: { id: string; seen: Set<string> };
}) {
  const reduceMotion = useReducedMotion();
  const [animate] = useState(() => arrival == null || !arrival.seen.has(arrival.id));

  return (
    <AnimatedView
      className={className}
      onCSSAnimationStart={() => {
        if (arrival != null) arrival.seen.add(arrival.id);
      }}
      style={{
        animationName: animate ? (reduceMotion ? sectionFading : sectionEntering) : 'none',
        animationDuration: `${DURATION.swap}ms`,
        animationTimingFunction: EASE_OUT,
        // Native honours it; Reanimated's web path drops it, harmlessly.
        animationFillMode: 'both',
      }}
    >
      {children}
    </AnimatedView>
  );
}

/** Initial rows and started entrances stay still when a rail remounts them. */
export function useArrivalHistory(ids: readonly string[]): Set<string> {
  const [seen] = useState(() => new Set(ids));
  return seen;
}
