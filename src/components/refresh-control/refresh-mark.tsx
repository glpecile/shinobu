import { interpolate, type SharedValue, useAnimatedStyle, useDerivedValue, useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { Image } from '@/components/image';

const SIZE = 32;
/** Height of the band the mark centres in. */
export const MARK_BOX = 48;
/** Pull, in points, that fills the mark. Android refreshes on release past it. */
export const PULL_TRIGGER = 72;

const MARK = require('../../../assets/images/splash-icon.png');

// The ink sweeps into the glyph from the left and out to the right. The
// negative delay starts the loop halfway, on the full mark the pull left.
const WAVE_MS = 1200;
const wave = {
  from: { transform: [{ translateX: -SIZE }] },
  to: { transform: [{ translateX: SIZE }] },
};
const counterWave = {
  from: { transform: [{ translateX: SIZE }] },
  to: { transform: [{ translateX: -SIZE }] },
};
const waveTiming = {
  animationDuration: `${WAVE_MS}ms`,
  animationDelay: `${-WAVE_MS / 2}ms`,
  animationIterationCount: 'infinite',
  animationTimingFunction: 'linear',
} as const;

/**
 * The 忍 mark in the gap a pull opens: it grows and fills with ink from the
 * left as `gap` reaches `PULL_TRIGGER`, and the ink sweeps across it while
 * `refreshing`.
 */
export function RefreshMark({ gap, refreshing }: { gap: SharedValue<number>; refreshing: boolean }) {
  const reduceMotion = useReducedMotion();
  const inkOffset = useDerivedValue(() => -SIZE * (1 - Math.min(gap.get() / PULL_TRIGGER, 1)));
  const mark = useAnimatedStyle(() => ({
    opacity: interpolate(gap.get(), [8, 40], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(gap.get(), [0, PULL_TRIGGER, PULL_TRIGGER * 2.5], [0.5, 1, 1.25], 'clamp') }],
  }));
  const fill = useAnimatedStyle(() => ({ transform: [{ translateX: inkOffset.get() }] }));
  const counterFill = useAnimatedStyle(() => ({ transform: [{ translateX: -inkOffset.get() }] }));
  const waving = refreshing && !reduceMotion;

  return (
    <AnimatedView style={[{ width: SIZE, height: SIZE }, mark]}>
      <Image contentFit="contain" source={MARK} style={{ width: SIZE, height: SIZE, opacity: 0.25 }} transition={0} />
      {/* Remounted when the wave starts, so both halves begin on one frame. */}
      <AnimatedView
        className="absolute inset-0 overflow-hidden"
        key={waving ? 'wave' : 'fill'}
        style={waving ? { animationName: wave, ...waveTiming } : refreshing ? undefined : fill}
      >
        <AnimatedView style={waving ? { animationName: counterWave, ...waveTiming } : refreshing ? undefined : counterFill}>
          <Image contentFit="contain" source={MARK} style={{ width: SIZE, height: SIZE }} transition={0} />
        </AnimatedView>
      </AnimatedView>
    </AnimatedView>
  );
}
