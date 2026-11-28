import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  View,
} from 'react-native';

import { GestureScrollView } from '@/components/animated-view';
import { List, type ListProps } from '@/components/List';
import { type ThemeColorToken, useThemeColor } from '@/lib/theme-color';

import './rail.css';

const showsRailScrollbar = process.env.EXPO_OS === 'web';
const railScrollbarProps =
  process.env.EXPO_OS === 'web' ? { 'data-shinobu-rail': '' } : undefined;

export const RailFadeColor = createContext<ThemeColorToken>('--color-background');

type ScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

function useRailFade(onScroll?: ScrollHandler) {
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

/** `nestedScrollEnabled` keeps Android's horizontal pager from stealing drags started on the rail. */
export function Rail({ onScroll, ...rest }: ScrollViewProps) {
  const { scrollProps, fade } = useRailFade(onScroll);
  return (
    <View {...railScrollbarProps}>
      <GestureScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={showsRailScrollbar}
        {...rest}
        {...scrollProps}
      />
      {fade}
    </View>
  );
}

/** Caller must supply a bounded cross-axis height. */
export function VirtualizedRail<T>({ onScroll, ...props }: ListProps<T>) {
  const { scrollProps, fade } = useRailFade(onScroll);
  return (
    <View {...railScrollbarProps}>
      <List
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={showsRailScrollbar}
        {...props}
        {...scrollProps}
      />
      {fade}
    </View>
  );
}
