import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { FadeOut } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';

// Must stay in sync with MediaCard (w-40 = 160) and the mr-3 gap (12).
const CARD_WIDTH = 160;
const CARD_GAP = 12;

// Reanimated CSS animation: declarative, runs on the UI thread, and cleans
// itself up on unmount — no useEffect/Animated.loop lifecycle to manage.
const shimmer = {
  '0%': { transform: [{ translateX: -CARD_WIDTH }] },
  '100%': { transform: [{ translateX: CARD_WIDTH }] },
};

// Defined at module scope so the builder isn't recreated per render
// (react-native-best-practices: layout-animations).
const fadeOut = FadeOut.duration(250);

function ShimmerCard() {
  return (
    <View className="w-40 h-60 rounded-card overflow-hidden border border-border/50 bg-surface mr-3 relative">
      <View className="w-full h-full bg-muted/20" />
      <View className="absolute bottom-0 left-0 right-0 h-28 bg-black/40" />
      <View className="absolute bottom-0 left-0 right-0 p-3">
        <View className="h-4 bg-muted/30 rounded w-full mb-2" />
        <View className="h-3 bg-muted/20 rounded w-2/3" />
      </View>
      <AnimatedView
        className="absolute top-0 bottom-0 w-20 bg-white/5"
        style={{
          animationName: shimmer,
          animationDuration: '1500ms',
          animationIterationCount: 'infinite',
          animationTimingFunction: 'ease-in-out',
        }}
      />
    </View>
  );
}

function SkeletonRow({ cardCount }: { cardCount: number }) {
  return (
    <View className="mb-6">
      <View className="h-7 w-40 bg-muted/20 rounded mb-3 mx-4" />
      <ScrollView
        horizontal
        className="px-4"
        showsHorizontalScrollIndicator={false}
      >
        {Array.from({ length: cardCount }).map((_, index) => (
          <ShimmerCard key={index} />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * Placeholder shown while the unified feed is loading. Mirrors the real feed:
 * two rows (the always-present trending carousels), with enough cards to fill
 * the viewport edge to edge — the real carousels overflow the window, so a
 * fixed short card count would leave trailing whitespace on wide (web)
 * viewports and cause a visible fill-in when content lands.
 */
export function FeedSkeleton() {
  const { width } = useWindowDimensions();
  // +1 so the last card is clipped by the edge, like a real carousel.
  const cardCount = Math.ceil(width / (CARD_WIDTH + CARD_GAP)) + 1;

  return (
    <View className="pt-2">
      <SkeletonRow cardCount={cardCount} />
      <SkeletonRow cardCount={cardCount} />
    </View>
  );
}

/**
 * Cross-fade variant: rendered on top of the (still-loading) feed content and
 * removed once `visible` flips false — the exiting animation fades it out, so
 * skeleton → content never swaps abruptly. The opaque background is what
 * hides the content underneath while loading; keep it in sync with the screen
 * background.
 */
export function FeedSkeletonOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <AnimatedView
      className="bg-background"
      exiting={fadeOut}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <FeedSkeleton />
    </AnimatedView>
  );
}
