import { useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { cn } from '@/lib/cn';
import { DURATION } from '@/lib/motion';

const pulse = {
  '0%': { opacity: 0.5 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.5 },
};

/** Phase offset in ms for the `index`-th block of a group. */
export function staggerDelay(index: number): number {
  return (index % 5) * 80;
}

/** `delay` is in ms (from `staggerDelay`). */
export function Skeleton({
  className,
  delay = 0,
  animated = true,
}: {
  className?: string;
  delay?: number;
  animated?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [phase] = useState(() => performance.now() % DURATION.pulse);

  return (
    <AnimatedView
      className={cn('bg-muted/20', className)}
      style={
        reduceMotion || !animated
          ? { opacity: 0.75 }
          : {
              opacity: 0.5,
              animationName: pulse,
              animationDuration: `${DURATION.pulse}ms`,
              animationDelay: `${delay - phase}ms`,
              animationIterationCount: 'infinite',
              animationTimingFunction: 'ease-in-out',
            }
      }
    />
  );
}
