import { AnimatedView } from '@/components/animated-view';
import { cn } from '@/lib/cn';

// Reanimated CSS animation: declarative, runs on the UI thread, and cleans
// itself up on unmount — no useEffect/Animated.loop lifecycle to manage.
const pulse = {
  '0%': { opacity: 0.5 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.5 },
};

/**
 * A pulsing placeholder block; size/shape come from the caller's className
 * (e.g. "w-20 h-20 rounded-full"). Unlike FeedSkeleton's card shimmer this
 * makes no assumptions about dimensions, so it composes into any layout.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <AnimatedView
      className={cn('bg-muted/20', className)}
      style={{
        animationName: pulse,
        animationDuration: '1400ms',
        animationIterationCount: 'infinite',
        animationTimingFunction: 'ease-in-out',
      }}
    />
  );
}
