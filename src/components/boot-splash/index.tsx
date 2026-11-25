import { useLayoutEffect, useRef, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedView } from '@/components/animated-view';
import { Image } from '@/components/image';
import { KEYFRAME_EASE_OUT } from '@/lib/motion';

import { markBootRevealed } from './revealed';

export function dismissBootSplash() {}

export function BootSplash({ ready, onPainted }: { ready: boolean; onPainted: () => void }) {
  const [finished, setFinished] = useState(false);
  const laidOut = useRef(false);
  const imageLoaded = useRef(false);
  const opacity = useSharedValue(1);
  const reduced = useReducedMotion();
  const backdrop = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const mark = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : 1 + (1 - opacity.get()) * 0.5 }],
  }));

  function finish() {
    setFinished(true);
    markBootRevealed();
  }

  function reveal() {
    opacity.set(withTiming(0, {
      duration: reduced ? 120 : 300,
      easing: KEYFRAME_EASE_OUT,
      reduceMotion: ReduceMotion.Never,
    }, () => {
      scheduleOnRN(finish);
    }));
  }

  function painted() {
    if (laidOut.current && imageLoaded.current) onPainted();
  }

  useLayoutEffect(() => {
    if (!ready) return;
    void SplashScreen.hideAsync().catch(() => {});
    reveal();
  }, [ready]);

  if (finished) return null;

  return (
    <AnimatedView
      className="pointer-events-none absolute inset-0 items-center justify-center bg-background"
      style={backdrop}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={() => {
        laidOut.current = true;
        painted();
      }}
    >
      <AnimatedView style={mark}>
        <Image
          source={require('../../../assets/images/splash-icon.png')}
          // Match expo-splash-screen's imageWidth for a seamless OS handoff.
          style={{ width: 200, height: 200 }}
          contentFit="contain"
          transition={0}
          onLoadEnd={() => {
            imageLoaded.current = true;
            painted();
          }}
        />
      </AnimatedView>
    </AnimatedView>
  );
}
