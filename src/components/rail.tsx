import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  type ScrollViewProps,
  View,
} from 'react-native';

import { type ThemeColorToken, useThemeColor } from '@/lib/theme-color';

/**
 * The token a rail's end fade blends into. A surface other than the page
 * background, like a sheet, provides its own.
 */
export const RailFadeColor = createContext<ThemeColorToken>('--color-background');

type ScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

/**
 * A fade at the trailing edge of a horizontal scroller until it reaches the
 * end. Spread `scrollProps` on the scroller and render `fade` after it, in a
 * wrapper that doesn't set its own size, so the fade matches its frame.
 *
 * A rail whose content fits never scrolls, so its fade stays, over empty
 * space, in the color it fades into. That breaks only when content ends inside
 * the last 32pt without overflowing.
 */
export function useRailFade(onScroll?: ScrollHandler) {
  const color = useThemeColor(useContext(RailFadeColor));
  const [atEnd, setAtEnd] = useState(false);
  // Web hands back `var(--token)`, which takes no alpha suffix, and browsers
  // interpolate gradients premultiplied, so `transparent` fades cleanly there.
  // Native interpolates straight RGBA: its clear stop must share the hue.
  const clear = color?.startsWith('var(') ? 'transparent' : `${color}00`;

  return {
    scrollProps: {
      scrollEventThrottle: 16,
      onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        setAtEnd(contentOffset.x + layoutMeasurement.width >= contentSize.width - 1);
        onScroll?.(event);
      },
    },
    fade: !atEnd && color != null && (
      <LinearGradient
        colors={[clear, color]}
        end={{ x: 1, y: 0 }}
        start={{ x: 0, y: 0 }}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: 32,
          pointerEvents: 'none',
        }}
      />
    ),
  };
}

/**
 * A horizontal scroll row with the trailing fade. `nestedScrollEnabled`: on
 * Android the episode pager otherwise takes every horizontal drag that starts
 * on the rail.
 */
export function Rail({ onScroll, ...rest }: ScrollViewProps) {
  const { scrollProps, fade } = useRailFade(onScroll);
  return (
    <View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        {...rest}
        {...scrollProps}
      />
      {fade}
    </View>
  );
}
