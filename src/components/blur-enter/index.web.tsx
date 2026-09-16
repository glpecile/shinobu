import type { ReactNode } from 'react';
import { css, useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { DURATION, EASE_OUT } from '@/lib/motion';

/**
 * Web: the content resolves out of a blur while it fades and rises, so the
 * skeleton and the content read as one thing sharpening rather than two
 * things swapping. A CSS filter is GPU-composited here, which is exactly what
 * it is not on native (see the sibling `index.tsx`).
 */
const entering = css.keyframes({
  from: { opacity: 0, filter: [{ blur: 6 }], transform: [{ translateY: 8 }] },
  to: { opacity: 1, filter: [{ blur: 0 }], transform: [{ translateY: 0 }] },
});

const fading = css.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

/** Mirrors index.tsx — keep both variants' props identical. */
export function BlurEnter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatedView
      className={className}
      style={{
        animationName: reduceMotion ? fading : entering,
        animationDuration: `${DURATION.enter}ms`,
        animationTimingFunction: EASE_OUT,
        animationFillMode: 'both',
      }}
    >
      {children}
    </AnimatedView>
  );
}
