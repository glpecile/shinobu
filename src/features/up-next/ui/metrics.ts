import type { DimensionValue } from 'react-native';

/** Card backs peek above the face; both loaded rails and placeholders reserve it. */
export const STACK_OFFSET = 5;

/** 144px art, 8px gap, then scaled text or the 44px quick-log FAB. */
export function episodeCardRailHeight(fontScale: number, headroom = 0): DimensionValue {
  const height = 152 + Math.max(44, 44 * fontScale) + headroom;
  // Web's card classes use rem; a pixel rail clips them when the root font grows.
  return process.env.EXPO_OS === 'web' ? `${height / 16}rem` as DimensionValue : height;
}
