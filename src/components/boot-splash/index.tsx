import { useRef, useState } from 'react';
import { Text } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedView } from '@/components/animated-view';
import { KEYFRAME_EASE_OUT } from '@/lib/motion';

export function dismissBootSplash() {}

/** Hand the OS splash to a themed overlay once the ready app has laid out. */
export function BootSplash() {
  const [finished, setFinished] = useState(false);
  const started = useRef(false);
  const opacity = useSharedValue(1);
  const reduced = useReducedMotion();
  const backdrop = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const mark = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : 1 + (1 - opacity.get()) * 0.5 }],
  }));

  function finish() {
    setFinished(true);
  }

  function reveal() {
    opacity.set(withTiming(0, {
      duration: reduced ? 120 : 300,
      easing: KEYFRAME_EASE_OUT,
      // Reduced motion retains the fade, but drops the scale above.
      reduceMotion: ReduceMotion.Never,
    }, (complete) => {
      if (complete) scheduleOnRN(finish);
    }));
  }

  if (finished) return null;

  return (
    <AnimatedView
      className="absolute inset-0 items-center justify-center bg-background"
      style={backdrop}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={() => {
        if (started.current) return;
        started.current = true;
        void SplashScreen.hideAsync().then(reveal, reveal);
      }}
    >
      <AnimatedView className="items-center gap-3" style={mark}>
        <Text className="text-4xl text-accent">忍</Text>
        <Text className="font-display text-lg text-foreground">Shinobu</Text>
      </AnimatedView>
    </AnimatedView>
  );
}
