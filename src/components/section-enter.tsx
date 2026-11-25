import { useState, type ReactNode } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { DURATION, EASE_OUT } from '@/lib/motion';

const SECTION_RISE = 6;

const sectionEntering = {
  '0%': { opacity: 0, transform: [{ translateY: SECTION_RISE }] },
  '100%': { opacity: 1, transform: [{ translateY: 0 }] },
};

export const sectionFading = {
  '0%': { opacity: 0 },
  '100%': { opacity: 1 },
};

/** Embeds the delay in keyframes because Reanimated's web CSS animations drop `animationFillMode`. */
export function heldKeyframes<Frame>(
  keyframes: { '0%': Frame; '100%': Frame },
  delay: number,
  duration: number,
) {
  return {
    '0%': keyframes['0%'],
    [`${(delay / (delay + duration)) * 100}%`]: keyframes['0%'],
    '100%': keyframes['100%'],
  };
}

/** Uses a CSS animation rather than Reanimated `entering=`, which pins the wrapper out of web scroll-view flow. */
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

export function useArrivalHistory(ids: readonly string[]): Set<string> {
  const [seen] = useState(() => new Set(ids));
  return seen;
}
