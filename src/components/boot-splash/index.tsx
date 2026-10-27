import { useLayoutEffect, useRef, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedView } from '@/components/animated-view';
import { Image } from '@/components/image';
import { KEYFRAME_EASE_OUT } from '@/lib/motion';

import { markBootRevealed } from './revealed';

export function dismissBootSplash() {}

/**
 * Hands the OS splash to a themed overlay. It mounts ahead of the app and
 * calls `onPainted` once its image is on screen; the app renders after that,
 * and the commit that mounts it passes `ready` and starts the reveal.
 */
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
      // Reduced motion retains the fade, but drops the scale above.
      reduceMotion: ReduceMotion.Never,
    }, (complete) => {
      if (complete) scheduleOnRN(finish);
    }));
  }

  function painted() {
    if (laidOut.current && imageLoaded.current) onPainted();
  }

  // A layout effect runs in the commit that mounts the app, before that
  // commit's effects and the re-renders they schedule. The fade runs on the UI
  // thread, so it starts beside the hide rather than after its promise.
  useLayoutEffect(() => {
    if (!ready) return;
    void SplashScreen.hideAsync().catch(() => {});
    reveal();
  }, [ready]);

  if (finished) return null;

  return (
    <AnimatedView
      // Faded out before the JS thread gets to unmount it.
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
