import { useEffect, useState } from 'react';
import { Animated, Platform } from 'react-native';

// react-native-web has no native animated module — passing true there only
// logs a warning and falls back to the JS driver anyway.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * A pulsing placeholder block; size/shape come from the caller's className
 * (e.g. "w-20 h-20 rounded-full"). Unlike FeedSkeleton's card shimmer this
 * makes no assumptions about dimensions, so it composes into any layout.
 */
export function Skeleton({ className }: { className?: string }) {
  const [opacity] = useState(() => new Animated.Value(0.5));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 700,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      className={`bg-muted/20 ${className ?? ''}`}
      style={{ opacity }}
    />
  );
}
