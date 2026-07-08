import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useEffect, useState } from 'react';

// react-native-web has no native animated module — passing true there only
// logs a warning and falls back to the JS driver anyway.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

// Must stay in sync with MediaCard (w-40 = 160) and the mr-3 gap (12).
const CARD_WIDTH = 160;
const CARD_GAP = 12;

function ShimmerCard() {
  const [translateX] = useState(() => new Animated.Value(-160));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: 160,
        duration: 1500,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [translateX]);

  return (
    <View className="w-40 h-60 rounded-card overflow-hidden border border-border/50 bg-surface mr-3 relative">
      <View className="w-full h-full bg-muted/20" />
      <View className="absolute bottom-0 left-0 right-0 h-28 bg-black/40" />
      <View className="absolute bottom-0 left-0 right-0 p-3">
        <View className="h-4 bg-muted/30 rounded w-full mb-2" />
        <View className="h-3 bg-muted/20 rounded w-2/3" />
      </View>
      <Animated.View
        className="absolute top-0 bottom-0 w-20 bg-white/5"
        style={{ transform: [{ translateX }] }}
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
 * faded out once `visible` flips false, so skeleton → content never swaps
 * abruptly. The opaque background is what hides the content underneath while
 * loading; keep it in sync with the screen background.
 */
export function FeedSkeletonOverlay({ visible }: { visible: boolean }) {
  const [opacity] = useState(() => new Animated.Value(visible ? 1 : 0));
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      opacity.setValue(1);
      return;
    }

    const fade = Animated.timing(opacity, {
      toValue: 0,
      duration: 250,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    fade.start(({ finished }) => {
      if (finished) setRendered(false);
    });
    return () => fade.stop();
  }, [visible, opacity]);

  if (!rendered) return null;

  return (
    <Animated.View
      className="bg-background"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity }]}
    >
      <FeedSkeleton />
    </Animated.View>
  );
}
