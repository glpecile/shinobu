import type { ReactNode } from 'react';
import { css, useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { DURATION, EASE_OUT } from '@/lib/motion';

/**
 * Native: a fade and a short rise. The web variant resolves out of a blur as
 * well; a `filter` here is a SwiftUI-backed effect that re-rasterizes the whole
 * scroll view every frame it animates
 * (docs/solutions/season-switch-jank-remount-and-blur-on-native.md).
 */
const entering = css.keyframes({
  from: { opacity: 0, transform: [{ translateY: 8 }] },
  to: { opacity: 1, transform: [{ translateY: 0 }] },
});

const fading = css.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

/**
 * A screen's content arriving in place of its skeleton. Mirrors
 * index.web.tsx — keep both variants' props identical.
 */
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
