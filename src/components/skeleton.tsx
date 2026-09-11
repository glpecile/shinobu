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
 * Phase offset for the `index`-th block of a group, in ms. A row of blocks all
 * breathing on the same frame reads as one flashing rectangle — the eye sees
 * the whole row blink. Offsetting each block by a beat turns that into a wave
 * travelling across the row, which is what makes a loading state read as
 * *loading* rather than as broken chrome.
 *
 * Wrapped at five steps: past that the last card in a wide row would start
 * most of a cycle behind the first and the wave stops reading as one gesture.
 * 80ms a step, so a whole wave (320ms) stays inside the 30–80ms-per-item band
 * that keeps a stagger from feeling like latency.
 */
export function staggerDelay(index: number): number {
  return (index % 5) * 80;
}

/**
 * A pulsing placeholder block; size/shape come from the caller's className
 * (e.g. "w-20 h-20 rounded-full"). It makes no assumptions about dimensions,
 * so it composes into any layout — every skeleton in the app is built out of
 * it, which is what keeps one loading vocabulary across screens.
 *
 * Pass `delay` (from `staggerDelay`) for a block that sits in a row or grid of
 * siblings. Blocks belonging to *one* card (art + its two text lines) share a
 * delay so the card breathes as a unit.
 */
export function Skeleton({
  className,
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) {
  // Reduced motion drops the loop entirely rather than softening it: this one
  // repeats until the network answers, and an ambient pulse is exactly the
  // kind of unrequested movement the setting is asking us to stop.
  const reduceMotion = useReducedMotion();

  return (
    <AnimatedView
      className={cn('bg-muted/20', className)}
      style={
        reduceMotion
          ? { opacity: 0.75 }
          : {
              // Matches the keyframe's 0%, so a delayed block waits at the dim
              // end of the cycle instead of sitting fully opaque and snapping
              // down when its turn arrives.
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
