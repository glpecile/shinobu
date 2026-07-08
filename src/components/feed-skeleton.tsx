import { Animated, ScrollView, View } from 'react-native';
import { useEffect, useState } from 'react';

function ShimmerCard() {
  const [translateX] = useState(() => new Animated.Value(-160));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: 160,
        duration: 1500,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [translateX]);

  return (
    <View className="w-40 h-60 rounded-card overflow-hidden border border-border/50 bg-surface mr-3 relative">
      <View className="w-full h-full bg-muted/20" />
      <Animated.View
        className="absolute top-0 bottom-0 w-20 bg-white/10"
        style={{ transform: [{ translateX }] }}
      />
    </View>
  );
}

function SkeletonRow() {
  return (
    <View className="mb-6">
      <View className="h-7 w-32 bg-muted/20 rounded mb-3 mx-4" />
      <ScrollView
        horizontal
        className="px-4"
        showsHorizontalScrollIndicator={false}
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <ShimmerCard key={index} />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * Placeholder shown while the unified feed is loading. Mirrors the horizontal
 * carousel layout and card dimensions exactly so there is no layout shift when
 * real content replaces it.
 */
export function FeedSkeleton() {
  return (
    <View className="pt-2">
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </View>
  );
}
