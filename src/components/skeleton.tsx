import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { cn } from '@/lib/cn';
import { DURATION } from '@/lib/motion';

// Reanimated CSS animation: declarative, runs on the UI thread, and cleans
// itself up on unmount — no useEffect/Animated.loop lifecycle to manage.
const pulse = {
  '0%': { opacity: 0.5 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.5 },
};

/**
 * Phase offset for the `index`-th block of a group, in ms: blocks pulsing on
 * the same frame read as one rectangle blinking. Wrapped at five steps so the
 * last card in a wide row isn't most of a cycle behind the first.
 */
export function staggerDelay(index: number): number {
  return (index % 5) * 80;
}

/**
 * A pulsing placeholder block; size/shape come from the caller's className
 * (e.g. "w-20 h-20 rounded-full"). Every skeleton in the app composes this.
 *
 * Pass `delay` (from `staggerDelay`) in a row or grid; blocks belonging to one
 * card share a delay so it breathes as a unit.
 */
export function Skeleton({
  className,
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) {
  // Dropped entirely, not softened: this loop runs until the network answers.
  const reduceMotion = useReducedMotion();

  return (
    <AnimatedView
      className={cn('bg-muted/20', className)}
      style={
        reduceMotion
          ? { opacity: 0.75 }
          : {
              // The keyframe's 0%, so a delayed block waits dim rather than
              // snapping down when its turn arrives.
              opacity: 0.5,
              animationName: pulse,
              animationDuration: `${DURATION.pulse}ms`,
              animationDelay: `${delay}ms`,
              animationIterationCount: 'infinite',
              animationTimingFunction: 'ease-in-out',
            }
      }
    />
  );
}
