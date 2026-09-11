import type { ReactNode } from 'react';
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
  // Defaulted, not left undefined: uniwind hands `className` to styleq, which
  // rejects `undefined` outright ('typeof undefined is not "string" or "null"').
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatedView
      className={className}
      style={{
        animationName: reduceMotion ? sectionFading : sectionEntering,
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
