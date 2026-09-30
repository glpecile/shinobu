import { Text, View } from 'react-native';
import { createAnimatedComponent, useReducedMotion } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { AnimatedView } from '@/components/animated-view';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';

export type ToastKind = 'success' | 'error';

const AnimatedPath = createAnimatedComponent(Path);
const DRAW_CHECK = {
  from: { strokeDashoffset: 20 },
  to: { strokeDashoffset: 0 },
};
const FADE_MARK = { from: { opacity: 0 }, to: { opacity: 1 } };

/** Shared announcement card; Sonner owns its lifetime, stacking, and dismissal. */
export function ToastCard({
  kind,
  title,
  message,
}: {
  kind: ToastKind;
  title: string;
  message?: string;
}) {
  const reducedMotion = useReducedMotion();
  const iconColor = useThemeColor(
    kind === 'success' ? '--color-success' : '--color-accent-on-tonal',
  );
  const shadowColor = useThemeColor('--color-toast-shadow');

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={message ? `${title}. ${message}` : title}
      className={cn('w-full flex-row items-center gap-3 rounded-xl bg-toast-surface px-4 py-3.5')}
      style={{
        boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: shadowColor }],
      }}
    >
      <AnimatedView
        className={cn(
          'size-8 shrink-0 items-center justify-center rounded-full',
          kind === 'success' ? 'bg-success-tonal' : 'bg-accent-tonal',
        )}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        style={{
          animationName: FADE_MARK,
          animationDuration: DURATION.color,
          animationTimingFunction: EASE_OUT,
        }}
      >
        <Svg width={20} height={20} viewBox="0 0 24 24" aria-hidden>
          <AnimatedPath
            d={kind === 'success' ? 'M5 12l4 4L19 6' : 'M12 6v7m0 4h.01'}
            fill="none"
            stroke={iconColor}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={kind === 'success' ? 20 : undefined}
            animatedProps={{
              strokeDashoffset: 0,
              animationName: kind === 'success' && !reducedMotion ? DRAW_CHECK : undefined,
              animationDuration: DURATION.swap,
              animationDelay: DURATION.enter / 2,
              animationFillMode: 'both',
              animationTimingFunction: EASE_OUT,
            }}
          />
        </Svg>
      </AnimatedView>
      <View className={cn('min-w-0 flex-1 gap-0.5')}>
        <Text className={cn('font-sans-semibold text-sm leading-5 text-foreground')}>
          {title}
        </Text>
        {message ? (
          <Text className={cn('font-sans text-sm leading-5 text-muted')}>
            {message}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
