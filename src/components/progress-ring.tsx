import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { createAnimatedComponent, useAnimatedProps, useReducedMotion, withTiming } from 'react-native-reanimated';

import { useThemeColor } from '@/lib/theme-color';
import { DURATION, TIMING_EASE_IN_OUT } from '@/lib/motion';

const AnimatedCircle = createAnimatedComponent(Circle);

/** Determinate progress only: callers with an unknown total show a count instead. */
export function ProgressRing({ value, max, label, size = 16 }: { value: number; max: number; label: string; size?: number }) {
  const accent = useThemeColor('--color-accent');
  const border = useThemeColor('--color-border');
  const radius = (size - 3) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const reducedMotion = useReducedMotion();
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: withTiming(circumference * (1 - fraction), {
      duration: reducedMotion ? 0 : DURATION.toggle,
      easing: TIMING_EASE_IN_OUT,
    }),
  }), [circumference, fraction, reducedMotion]);
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: Math.min(value, max) }}>
      <Svg height={size} width={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={border} strokeWidth={2} />
        <AnimatedCircle animatedProps={animatedProps} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={accent} strokeWidth={2} strokeDasharray={`${circumference} ${circumference}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
    </View>
  );
}
