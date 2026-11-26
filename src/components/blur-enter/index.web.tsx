import type { ReactNode } from 'react';
import { css, useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { DURATION, EASE_OUT } from '@/lib/motion';

const entering = css.keyframes({
  from: { opacity: 0, filter: [{ blur: 6 }], transform: [{ translateY: 8 }] },
  to: { opacity: 1, filter: [{ blur: 0 }], transform: [{ translateY: 0 }] },
});

const fading = css.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

export function BlurEnter({ children, className }: { children: ReactNode; className?: string }) {
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
