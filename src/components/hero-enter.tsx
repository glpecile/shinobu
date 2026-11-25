import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { ProviderIcon } from '@/components/provider-icon';
import { heldKeyframes, sectionFading } from '@/components/section-enter';
import { EASE_OUT } from '@/lib/motion';
import { PROVIDERS } from '@/lib/providers/registry';

export const COPY_STAGGER = 60;
const HERO_ENTER_DURATION = 450;

/** Native `filter` re-rasterizes the view every frame it animates (docs/solutions/season-switch-jank-remount-and-blur-on-native.md). */
const heroEntering = process.env.EXPO_OS === 'web'
  ? {
      '0%': { opacity: 0, filter: 'blur(4px)', transform: [{ translateY: 8 }] },
      '100%': { opacity: 1, filter: 'blur(0px)', transform: [{ translateY: 0 }] },
    }
  : {
      '0%': { opacity: 0, transform: [{ translateY: 8 }] },
      '100%': { opacity: 1, transform: [{ translateY: 0 }] },
    };

export function HeroEnter({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatedView
      className={className}
      style={{
        animationName: heldKeyframes(reduceMotion ? sectionFading : heroEntering, delay, HERO_ENTER_DURATION),
        animationDuration: HERO_ENTER_DURATION + delay,
        animationTimingFunction: EASE_OUT,
      }}
    >
      {children}
    </AnimatedView>
  );
}

export function HeroProviders() {
  return (
    <View className="flex-row gap-1.5">
      {Object.values(PROVIDERS).map(({ id }) => (
        <View
          className="size-8 items-center justify-center rounded-lg bg-surface border border-border"
          key={id}
        >
          <ProviderIcon id={id} size={18} />
        </View>
      ))}
    </View>
  );
}
